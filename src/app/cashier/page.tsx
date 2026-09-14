"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import {
  Printer, CheckCircle, Clock, UtensilsCrossed, Plus, Search, ShoppingBag, X, Minus, Bike, Trash2, Star, ChevronDown
} from "lucide-react";
import MenuItemCard, { MenuItem as CardMenuItem } from "@/components/MenuItemCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useSettings } from "@/context/SettingsContext";

type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  is_new?: boolean;
  prepared?: boolean;
  added_at?: string;
  notes?: string;
};

type OrderStatus = "pending" | "Preparing" | "Ready" | "completed" | "Completed" | "Pending";
type OrderType = "dine-in" | "takeaway" | "delivery";

type Order = {
  id: string;
  created_at: string;
  table_no: string;
  items: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  order_type?: OrderType;
  customer_name?: string;
  payment_method?: string;
  notes?: string;
  discount?: number;
};

function ElapsedTime({ startTime }: { startTime: string }) {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    const update = () => {
      setMins(Math.floor((new Date().getTime() - new Date(startTime).getTime()) / 60000));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [startTime]);
  return <span className={mins >= 15 ? "text-red-500 font-bold" : "text-slate-500 font-bold"}>{mins}m</span>;
}

const playChime = (type: 'new_order' | 'order_ready') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'new_order') {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'order_ready') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch (e) {
    console.log('Audio playback prevented by browser auto-play policy', e);
  }
};

export default function CashierPage() {
  const { settings, refreshSettings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Dynamic tables state with immediate localStorage cache to prevent 8-table flicker
  const [dbTables, setDbTables] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("pos_cached_restaurant_tables");
        if (cached) return JSON.parse(cached);
      } catch (e) {
        console.warn("Failed to read cached tables:", e);
      }
    }
    return [];
  });

  // Manual Order Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType | string>("dine-in-1");
  const [customerName, setCustomerName] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile cart expansion toggle
  const [isMobileCartExpanded, setIsMobileCartExpanded] = useState(false);

  // Dynamic Fast Moving Item IDs based on historical completed sales
  const [fastMovingItemIds, setFastMovingItemIds] = useState<string[]>([]);

  // Fetch actual top sold items from completed orders
  useEffect(() => {
    const fetchTopSellingItems = async () => {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("items")
          .in("status", ["completed", "Completed"])
          .order("created_at", { ascending: false })
          .limit(100);

        if (!error && data && data.length > 0) {
          const itemSalesMap = new Map<string, number>();

          data.forEach((order: any) => {
            if (Array.isArray(order.items)) {
              order.items.forEach((item: any) => {
                const rawName = String(item.name || "").replace(/\s*\((Regular|Large)\)\s*/gi, "").trim().toLowerCase();
                const qty = Number(item.quantity || 1);
                if (rawName) {
                  itemSalesMap.set(rawName, (itemSalesMap.get(rawName) || 0) + qty);
                }
              });
            }
          });

          // Sort by top sold
          const sortedNames = Array.from(itemSalesMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([name]) => name);

          setFastMovingItemIds(sortedNames);
        }
      } catch (e) {
        console.warn("Could not calculate fast moving items:", e);
      }
    };

    if (isModalOpen) {
      fetchTopSellingItems();
    }
  }, [isModalOpen]);

  // Favorites state persisted in localStorage
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("pos_favorite_dishes");
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      if (typeof window !== "undefined") {
        localStorage.setItem("pos_favorite_dishes", JSON.stringify(next));
      }
      return next;
    });
  };

  // F12 Global Key Handler to toggle New Order Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        setIsModalOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Discount State
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Split Payment State
  const [showSplitPayment, setShowSplitPayment] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState<string>("");

  // Cash Calculator State
  const [showCashCalculator, setShowCashCalculator] = useState(false);
  const [cashGiven, setCashGiven] = useState<string>("");

  // Recent Bills State
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [recentBills, setRecentBills] = useState<Order[]>([]);

  // Ready Toast State
  const [readyToast, setReadyToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });

  // Error/Info Toast
  const [errorToast, setErrorToast] = useState<{ show: boolean; message: string; type: "error" | "info" }>({ show: false, message: "", type: "error" });
  const errorToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showError = useCallback((message: string, type: "error" | "info" = "error") => {
    if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
    setErrorToast({ show: true, message, type });
    errorToastTimer.current = setTimeout(() => setErrorToast({ show: false, message: "", type: "error" }), 4000);
  }, []);

  // Custom Discount Inline Modal State
  const [showCustomDiscountModal, setShowCustomDiscountModal] = useState(false);
  const [customDiscountInput, setCustomDiscountInput] = useState("");

  // Payment Success Overlay State
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [lastSettledDetails, setLastSettledDetails] = useState<{
    orderId: string;
    tableNo: string;
    orderType: string;
    totalAmount: number;
    paymentMethod: string;
    change: number;
  } | null>(null);
  const successDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerPaymentSuccess = useCallback((
    orderId: string,
    tableNo: string,
    orderType: string,
    totalAmount: number,
    paymentMethod: string,
    change: number = 0
  ) => {
    if (successDismissTimer.current) clearTimeout(successDismissTimer.current);
    setLastSettledDetails({ orderId, tableNo, orderType, totalAmount, paymentMethod, change });
    setShowPaymentSuccess(true);
    successDismissTimer.current = setTimeout(() => setShowPaymentSuccess(false), 2500);
  }, []);

  // 2-Step Billing State
  const [billedOrders, setBilledOrders] = useState<Set<string>>(new Set());
  const [paymentModalOrderId, setPaymentModalOrderId] = useState<string | null>(null);
  const [stagedDirectOrder, setStagedDirectOrder] = useState<any>(null);

  const [isPettyCashModalOpen, setIsPettyCashModalOpen] = useState(false);
  const [pettyCashForm, setPettyCashForm] = useState({ amount: "", reason: "", receivedBy: "" });
  const [voucherData, setVoucherData] = useState<any>(null);
  const [printOrderData, setPrintOrderData] = useState<Order | null>(null);
  const [printMetadata, setPrintMetadata] = useState<{ tendered?: string; change?: number } | null>(null);
  const [kotPrintData, setKotPrintData] = useState<Order | null>(null);

  const channelRef = useRef<any>(null);

  // Print tracking
  const isPrintingRef = useRef(false);
  const lastPrintTimeRef = useRef<number>(0);
  const localHandledOrderIds = useRef<Set<string>>(new Set());
  const printedItemCountsRef = useRef<Record<string, number>>({});
  const ordersRef = useRef<Order[]>([]);
  const selectedOrderIdRef = useRef<string | null>(null);

  useEffect(() => { ordersRef.current = orders; }, [orders]);
  useEffect(() => { selectedOrderIdRef.current = selectedOrderId; }, [selectedOrderId]);

  const isAnyModalOpen = Boolean(isModalOpen || showRecentBills || isPettyCashModalOpen || paymentModalOrderId || stagedDirectOrder || showCustomDiscountModal);
  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isAnyModalOpen]);

  const triggerSafePrint = useCallback((order: Order, isKot: boolean = false, onClose?: () => void) => {
    if (typeof window === "undefined") return;
    if (isKot && (!order.items || order.items.length === 0)) return;

    const now = Date.now();
    if (isPrintingRef.current || now - lastPrintTimeRef.current < 800) {
      return;
    }
    isPrintingRef.current = true;
    lastPrintTimeRef.current = now;

    if (isKot) {
      setKotPrintData(order);
      setPrintOrderData(null);
      setVoucherData(null);
    } else {
      setPrintOrderData(order);
      setKotPrintData(null);
      setVoucherData(null);
    }

    const releaseLock = () => {
      isPrintingRef.current = false;
      if (onClose) onClose();
      window.removeEventListener('afterprint', releaseLock);
    };

    window.addEventListener('afterprint', releaseLock, { once: true });

    setTimeout(() => {
      isPrintingRef.current = false;
    }, 3500);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.print();
        } catch (e) {
          console.error("Print execution failed:", e);
          isPrintingRef.current = false;
        }
      });
    });
  }, []);

  useEffect(() => {
    if (refreshSettings) {
      refreshSettings();
    }
  }, [refreshSettings]);

  // Direct Fetch & Realtime sync from restaurant_tables with LocalStorage cache
  useEffect(() => {
    const fetchRestaurantTables = async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const sorted = [...data].sort((a, b) => {
          const numA = parseInt(a.table_no, 10);
          const numB = parseInt(b.table_no, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return String(a.table_no).localeCompare(String(b.table_no));
        });

        const formatted = sorted.map((t: any) => ({
          id: String(t.table_no),
          name: `Table ${String(t.table_no).padStart(2, "0")}`,
          capacity: Number(t.capacity || 4),
          section: t.floor_area || "Tables",
        }));

        setDbTables(formatted);
        if (typeof window !== "undefined") {
          localStorage.setItem("pos_cached_restaurant_tables", JSON.stringify(formatted));
        }
      }
    };

    fetchRestaurantTables();

    const channel = supabase
      .channel("restaurant_tables_realtime_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tables" },
        () => {
          fetchRestaurantTables();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const tables = useMemo(() => {
    if (dbTables.length > 0) {
      return dbTables;
    }
    return Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1),
      name: `Table ${String(i + 1).padStart(2, "0")}`,
      capacity: 4,
      section: "Tables",
    }));
  }, [dbTables]);

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .not("status", "in", '("completed","Completed")')
      .order("created_at", { ascending: false });

    if (data) {
      setOrders(data as Order[]);
      data.forEach((o: any) => {
        if (printedItemCountsRef.current[o.id] === undefined) {
          printedItemCountsRef.current[o.id] = (o.items || []).length;
        }
      });
    }
  }, []);

  const setupRealtime = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `cashier-kanban-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as Order;
            if (newOrder.status?.toLowerCase() === "completed") return;

            const isLocal = localHandledOrderIds.current.has(newOrder.id);
            if (!isLocal && (newOrder.status?.toLowerCase() === "pending")) {
              printedItemCountsRef.current[newOrder.id] = (newOrder.items || []).length;
              triggerSafePrint(newOrder, true);
            }

            setOrders((prev) => {
              if (prev.some((o) => o.id === newOrder.id)) return prev;
              return [newOrder, ...prev];
            });
            playChime('new_order');
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Order;
            const isCompleted = updated.status?.toLowerCase() === "completed";

            if (isCompleted) {
              setOrders((prev) => prev.filter((o) => o.id !== updated.id));
              if (selectedOrderIdRef.current === updated.id) setSelectedOrderId(null);
            } else {
              const prevCount = printedItemCountsRef.current[updated.id] ?? (ordersRef.current.find(o => o.id === updated.id)?.items?.length || 0);
              const currentCount = (updated.items || []).length;

              setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));

              if (currentCount > prevCount && updated.status?.toLowerCase() !== 'completed') {
                const isLocal = localHandledOrderIds.current.has(updated.id);
                printedItemCountsRef.current[updated.id] = currentCount;

                if (!isLocal) {
                  const newlyAddedItems = updated.items.slice(prevCount);
                  if (newlyAddedItems.length > 0) {
                    triggerSafePrint({
                      ...updated,
                      items: newlyAddedItems,
                      notes: `[RUNNING KOT / ADD-ON] ${updated.notes || ''}`.trim()
                    }, true);
                    playChime('new_order');
                  }
                } else {
                  setTimeout(() => {
                    localHandledOrderIds.current.delete(updated.id);
                  }, 2000);
                }
              } else if (currentCount < prevCount) {
                printedItemCountsRef.current[updated.id] = currentCount;
              }

              if (updated.status === "Ready") {
                const isDineIn = !updated.order_type || updated.order_type === 'dine-in';
                const msg = isDineIn
                  ? `🔔 Table ${updated.table_no} is Ready to Serve!`
                  : `🛍️ ${updated.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'} order ${updated.id.substring(0, 5).toUpperCase()} is Ready for Pickup!`;

                setReadyToast({ show: true, message: msg });
                playChime('order_ready');
                setTimeout(() => setReadyToast({ show: false, message: "" }), 5000);
              }
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            setOrders((prev) => prev.filter((o) => o.id !== deletedId));
            if (selectedOrderIdRef.current === deletedId) setSelectedOrderId(null);
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR") {
          setTimeout(setupRealtime, 3000);
        }
      });

    channelRef.current = channel;
  }, [triggerSafePrint]);

  useEffect(() => {
    fetchOrders();
    setupRealtime();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchOrders, setupRealtime]);

  // Standard Industry Calculation for Final Settlement
  const updateOrderStatus = async (id: string, status: OrderStatus, paymentMethod?: string, tendered?: string, change?: number) => {
    if (tendered && change !== undefined) {
      setPrintMetadata({ tendered, change });
    }
    const updateData: any = { status };
    if (paymentMethod) updateData.payment_method = paymentMethod;
    if (tendered && change !== undefined) {
      const orderToUpdate = orders.find(o => o.id === id);
      const baseNotes = (orderToUpdate as any)?.notes || '';
      updateData.notes = `[Paid Cash: ${tendered} | Change: ${change}] ${baseNotes}`.trim();
    }

    if (status.toLowerCase() === "completed") {
      const orderToUpdate = orders.find(o => o.id === id);
      if (orderToUpdate) {
        const subtotal = (orderToUpdate.items || []).reduce(
          (sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0
        );

        let calcDiscount = 0;
        if (discountType === "percent") {
          calcDiscount = (subtotal * Number(discountValue || 0)) / 100;
        } else {
          calcDiscount = Number(discountValue || 0);
        }

        const isDineIn = !orderToUpdate.order_type || orderToUpdate.order_type === 'dine-in';
        const sChargePct = Number(settings?.service_charge_pct ?? 10);
        const tPct = Number(settings?.tax_pct ?? 0);
        const sCharge = isDineIn ? (subtotal * sChargePct) / 100 : 0;
        const tax = (subtotal * tPct) / 100;

        const grandTotal = Math.max(0, subtotal + sCharge + tax - calcDiscount);

        updateData.total_amount = Number(grandTotal);
        updateData.discount = Number(calcDiscount);

        setOrders(prev => prev.map(o => o.id === id ? { ...o, total_amount: grandTotal, discount: calcDiscount, status } : o));
      }
    } else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    }

    const { error } = await supabase.from("orders").update(updateData).eq("id", id);
    if (error) {
      showError(`Failed to update order: ${error.message}`);
      fetchOrders();
    } else if (status.toLowerCase() === "completed") {
      const orderToUpdate = orders.find(o => o.id === id);

      const cleanup = () => {
        setOrders(prev => prev.filter(o => o.id !== id));
        if (selectedOrderId === id) setSelectedOrderId(null);
        setPaymentModalOrderId(null);
        setShowSplitPayment(false);
        setSplitCashAmount("");
        setShowCashCalculator(false);
        setCashGiven("");
        setDiscountValue(0);
        setBilledOrders(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      };

      if (orderToUpdate) {
        const isDineIn = !orderToUpdate?.order_type || orderToUpdate?.order_type === 'dine-in';
        if (!isDineIn) {
          triggerSafePrint({ ...orderToUpdate, discount: updateData.discount, total_amount: updateData.total_amount, payment_method: paymentMethod || orderToUpdate.payment_method } as Order, false, () => {
            cleanup();
            setPrintMetadata(null);
          });
        } else {
          cleanup();
        }

        triggerPaymentSuccess(
          id,
          orderToUpdate.table_no,
          orderToUpdate.order_type || 'dine-in',
          updateData.total_amount ?? orderToUpdate.total_amount,
          paymentMethod || orderToUpdate.payment_method || 'Cash',
          change ?? 0
        );
      } else {
        cleanup();
      }
    }
  };

  const handleUpdateItemQuantity = async (orderId: string, itemId: string, delta: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    let newItems = [...(order.items || [])];

    if (delta === 0) {
      newItems = newItems.filter(i => String(i.id) !== String(itemId));
    } else if (delta < 0) {
      let targetIdx = newItems.findIndex(i => String(i.id) === String(itemId) && !i.prepared);
      if (targetIdx === -1) {
        targetIdx = newItems.findIndex(i => String(i.id) === String(itemId));
      }

      if (targetIdx !== -1) {
        const targetItem = newItems[targetIdx];
        if (targetItem.quantity + delta <= 0) {
          newItems.splice(targetIdx, 1);
        } else {
          newItems[targetIdx] = { ...targetItem, quantity: targetItem.quantity + delta };
        }
      } else {
        return;
      }
    }

    if (newItems.length === 0) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selectedOrderId === orderId) setSelectedOrderId(null);
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) {
        showError("Error deleting empty order.");
        fetchOrders();
      }
      return;
    }

    const subtotal = newItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity)), 0);
    const discount = Number(order.discount || 0);
    const isDineIn = !order.order_type || order.order_type === 'dine-in';
    const sChargePct = Number(settings?.service_charge_pct ?? 10);
    const tPct = Number(settings?.tax_pct ?? 0);
    const sCharge = isDineIn ? (subtotal * sChargePct) / 100 : 0;
    const tax = (subtotal * tPct) / 100;
    const grandTotal = Math.max(0, subtotal + sCharge + tax - discount);

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: newItems, total_amount: grandTotal } : o));

    const { error } = await supabase.from("orders").update({
      items: newItems,
      total_amount: Number(grandTotal)
    }).eq("id", orderId);

    if (error) {
      showError("Error updating item.");
      fetchOrders();
    }
  };

  const handleSettlePayment = async (method: string, passedTendered?: string, passedChange?: number) => {
    setIsSubmitting(true);
    const totalAmount = stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal;

    const tenderedAmt = passedTendered || (Number(cashGiven) > 0 ? String(Number(cashGiven)) : String(totalAmount));
    const changeAmt = passedChange !== undefined ? passedChange : (Number(tenderedAmt) > totalAmount ? Number(tenderedAmt) - totalAmount : 0);

    if (method === "Cash" || passedTendered) {
      setPrintMetadata({ tendered: tenderedAmt, change: changeAmt });
    }

    try {
      if (stagedDirectOrder) {
        const baseNotes = stagedDirectOrder.special_notes || '';
        const newNotes = (method === "Cash" || passedTendered) ? `[Paid Cash: ${tenderedAmt} | Change: ${changeAmt}] ${baseNotes}`.trim() : baseNotes;

        const payload = {
          table_no: stagedDirectOrder.order_type === 'dine-in' ? String(stagedDirectOrder.table_no || '1') : '0',
          order_type: stagedDirectOrder.order_type || 'takeaway',
          customer_name: stagedDirectOrder.customer_name?.trim() || null,
          items: stagedDirectOrder.items.map((item: any) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            quantity: Number(item.quantity),
            status: 'ready'
          })),
          total_amount: Number(stagedDirectOrder.total_amount || 0),
          payment_method: method || 'Cash',
          status: 'completed',
          discount: Number(discountValue || 0),
          notes: newNotes,
          created_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from("orders").insert([payload]).select();

        if (error) {
          console.error("Supabase Settlement Error Details:", error);
          showError("Settlement Error: " + error.message);
          setIsSubmitting(false);
          return;
        }

        if (data && data[0]) {
          const insertedOrder = data[0] as Order;
          localHandledOrderIds.current.add(insertedOrder.id);
          setSelectedOrderId(null);

          if (insertedOrder.order_type === 'takeaway' || insertedOrder.order_type === 'delivery') {
            const cleanup = () => {
              setPrintMetadata(null);
            };
            triggerSafePrint(insertedOrder, false, cleanup);
          }

          triggerPaymentSuccess(
            insertedOrder.id,
            insertedOrder.table_no,
            insertedOrder.order_type || 'dine-in',
            Number(insertedOrder.total_amount || 0),
            method,
            changeAmt
          );
        }

        setStagedDirectOrder(null);
        setPaymentModalOrderId(null);
        setShowSplitPayment(false);
        setSplitCashAmount("");
        setShowCashCalculator(false);
        setCashGiven("");
        setIsModalOpen(false);
        setCart([]);
        setCustomerName("");
        setSpecialNotes("");
        setDiscountValue(0);
      } else if (paymentModalOrderId) {
        await updateOrderStatus(
          paymentModalOrderId,
          "completed",
          method,
          method === "Cash" || passedTendered ? tenderedAmt : undefined,
          method === "Cash" || passedTendered ? changeAmt : undefined
        );
      }
    } catch (err: any) {
      console.error("Supabase Settle Error:", err);
      showError(err.message || "Failed to settle order. Check database fields.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFetchRecentBills = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .in("status", ["completed", "Completed"])
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) {
      setRecentBills(data as Order[]);
      setShowRecentBills(true);
    }
  };

  const handleReprint = (bill: Order) => {
    setOrders(prev => {
      if (!prev.find(o => o.id === bill.id)) return [...prev, bill];
      return prev;
    });
    setSelectedOrderId(bill.id);
    setShowRecentBills(false);
    triggerSafePrint(bill, false);
  };

  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  const serviceChargePct = Number(settings?.service_charge_pct ?? 10);
  const taxPct = Number(settings?.tax_pct ?? 0);
  const currencySymbol = settings?.currency || "LKR";

  let finalGrandTotal = 0;
  let calculatedDiscount = 0;
  let selectedOrderServiceCharge = 0;
  let selectedOrderTax = 0;
  let selectedOrderSubtotal = 0;

  if (selectedOrder) {
    selectedOrderSubtotal = (selectedOrder.items || []).reduce(
      (sum, item) => sum + (Number(item.price) * Number(item.quantity)),
      0
    );

    if (selectedOrder.status?.toLowerCase() === "completed" && selectedOrder.discount !== undefined) {
      calculatedDiscount = Number(selectedOrder.discount || 0);
    } else {
      if (discountType === "percent") {
        calculatedDiscount = (selectedOrderSubtotal * Number(discountValue || 0)) / 100;
      } else {
        calculatedDiscount = Number(discountValue || 0);
      }
    }

    const isDineIn = !selectedOrder.order_type || selectedOrder.order_type === 'dine-in';
    selectedOrderServiceCharge = isDineIn ? (selectedOrderSubtotal * serviceChargePct) / 100 : 0;
    selectedOrderTax = (selectedOrderSubtotal * taxPct) / 100;

    finalGrandTotal = Math.max(0, selectedOrderSubtotal + selectedOrderServiceCharge + selectedOrderTax - calculatedDiscount);
  }

  const handlePrintBill = (id: string) => {
    setBilledOrders(prev => new Set(prev).add(id));
    const orderToPrint = orders.find(o => o.id === id);
    if (orderToPrint) {
      const billPayload: Order = {
        ...orderToPrint,
        discount: calculatedDiscount,
        total_amount: finalGrandTotal
      };
      triggerSafePrint(billPayload, false);
    }
  };

  const receiptOrder = printOrderData || selectedOrder;

  useEffect(() => {
    setDiscountValue(0);
    setDiscountType("percent");
    setShowSplitPayment(false);
    setSplitCashAmount("");
    setShowCashCalculator(false);
    setCashGiven("");
  }, [selectedOrderId]);

  const [dbMenu, setDbMenu] = useState<any[]>([]);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const { data } = await supabase.from('menu_items').select('*').eq('is_available', true).order("category").order("name");
        if (data && data.length > 0) {
          setDbMenu(data);
        } else {
          setDbMenu([]);
        }
      } catch (err) {
        setDbMenu([]);
      }
    };
    fetchMenu();

    const channel = supabase.channel('public:menu_items:cashier')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchMenu();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const groupedMenu = useMemo(() => {
    const map = new Map<string, CardMenuItem>();

    dbMenu.forEach((item) => {
      const isRegular = item.name.includes("(Regular)");
      const isLarge = item.name.includes("(Large)");

      if (isRegular || isLarge) {
        const baseName = item.name.replace(/\s*\((Regular|Large)\)\s*/gi, "").trim();
        const groupKey = `${item.category}-${baseName}`;

        if (!map.has(groupKey)) {
          map.set(groupKey, {
            id: item.id,
            name: baseName,
            description: item.description,
            price: Number(item.price),
            category: item.category,
            image_url: item.image_url,
            is_veg: item.is_veg,
            is_spicy: item.is_spicy,
            is_popular: item.is_popular,
            is_available: item.is_available,
          });
        }

        const existing = map.get(groupKey)!;
        if (isLarge) {
          existing.large_item = {
            id: item.id,
            name: item.name,
            description: item.description,
            price: Number(item.price),
            category: item.category,
            image_url: item.image_url,
          };
        } else if (isRegular) {
          existing.id = item.id;
          existing.name = item.name;
          existing.price = Number(item.price);
        }
      } else {
        map.set(item.id, {
          id: item.id,
          name: item.name,
          description: item.description,
          price: Number(item.price),
          category: item.category,
          image_url: item.image_url,
          is_veg: item.is_veg,
          is_spicy: item.is_spicy,
          is_popular: item.is_popular,
          is_available: item.is_available,
        });
      }
    });

    return Array.from(map.values());
  }, [dbMenu]);

  const filteredMenu = useMemo(() => {
    let filtered = groupedMenu;

    if (activeCategory === "⭐ Favorites") {
      filtered = filtered.filter((item) => favoriteIds.includes(item.id));
    } else if (activeCategory === "🔥 Fast Moving") {
      // Dynamic Filter: Shows top selling items based on completed bills (or fallback to popular flag)
      filtered = filtered.filter((item) => {
        const cleanBase = item.name.replace(/\s*\((Regular|Large)\)\s*/gi, "").trim().toLowerCase();
        const isTopSold = fastMovingItemIds.some(name => cleanBase.includes(name) || name.includes(cleanBase));
        return isTopSold || item.is_popular;
      });
    } else if (activeCategory !== "All") {
      filtered = filtered.filter((item) => item.category === activeCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) => item.name.toLowerCase().includes(q) || (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [activeCategory, searchQuery, groupedMenu, favoriteIds, fastMovingItemIds]);

  const menuCategories = useMemo(() => {
    const cats = Array.from(
      new Set(groupedMenu.map((item) => item.category).filter(Boolean))
    ).sort() as string[];
    return ["All", "⭐ Favorites", "🔥 Fast Moving", ...cats];
  }, [groupedMenu]);

  const handleAddCardToCart = (item: CardMenuItem, selectedSize: "Regular" | "Large", finalPrice: number) => {
    let cartItemName = item.name;
    if (item.large_item) {
      cartItemName = `${item.name.replace(/\s*\((Regular|Large)\)\s*/gi, "").trim()} (${selectedSize})`;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.name === cartItemName);
      if (existing) {
        return prev.map((i) => (i.name === cartItemName ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { id: item.id, name: cartItemName, price: finalPrice, quantity: 1 }];
    });
  };

  const updateCart = (item: OrderItem, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id || i.name === item.name);
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) return prev.filter((i) => (i.id !== item.id && i.name !== item.name));
        return prev.map((i) => (i.name === item.name ? { ...i, quantity: newQty } : i));
      }
      return prev;
    });
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const isDineInCart = typeof orderType === 'string' && orderType.startsWith("dine-in");
  const cartServiceCharge = isDineInCart ? (cartSubtotal * serviceChargePct) / 100 : 0;
  const cartTax = (cartSubtotal * taxPct) / 100;
  const cartTotal = cartSubtotal + cartServiceCharge + cartTax;

  const consolidateItems = (items: OrderItem[]) => {
    const map = new Map<string, OrderItem>();
    items.forEach(item => {
      if (map.has(item.id)) {
        const existing = map.get(item.id)!;
        existing.quantity += item.quantity;
      } else {
        map.set(item.id, { ...item });
      }
    });
    return Array.from(map.values());
  };

  const submitManualOrder = async (isDirectSettle: boolean) => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    const isDineInOrder = typeof orderType === 'string' && orderType.startsWith("dine-in");
    const type: OrderType = isDineInOrder ? "dine-in" : (orderType as OrderType);
    const tableNumber = isDineInOrder ? String(orderType.split("-")[2] || "1") : "0";

    const cleanedItems = cart.map((item) => ({
      id: String(item.id),
      name: String(item.name),
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      notes: (item as any).notes || "",
    }));

    try {
      if (type === "dine-in" && !isDirectSettle) {
        const { data: activeOrders, error: fetchError } = await supabase
          .from("orders")
          .select("*")
          .eq("table_no", tableNumber)
          .in("status", ["pending", "Preparing", "Ready"])
          .order("created_at", { ascending: false })
          .limit(1);

        if (!fetchError && activeOrders && activeOrders.length > 0) {
          const activeOrder = activeOrders[0];
          const existingItems = (Array.isArray(activeOrder.items) ? activeOrder.items : []).map((item: any) => ({ ...item, prepared: item.prepared ?? false }));
          const newItems = cleanedItems.map((item) => ({ ...item, is_new: true, prepared: false, added_at: new Date().toISOString() }));
          const mergedItems = [...existingItems, ...newItems];
          const newTotalAmount = Number(activeOrder.total_amount || 0) + Number(cartTotal || 0);

          const { error: updateError } = await supabase
            .from("orders")
            .update({
              items: mergedItems,
              total_amount: newTotalAmount,
              status: "pending",
            })
            .eq("id", activeOrder.id);

          if (updateError) throw updateError;

          localHandledOrderIds.current.add(activeOrder.id);
          printedItemCountsRef.current[activeOrder.id] = mergedItems.length;

          const kotPayload = {
            ...activeOrder,
            items: newItems
          };
          triggerSafePrint(kotPayload as Order, true);

          setIsModalOpen(false);
          setCart([]);
          setCustomerName("");
          setSpecialNotes("");
          setOrderType("dine-in-1");
          fetchOrders();
          return;
        }
      }

      const newOrderPayload = {
        table_no: tableNumber,
        items: cleanedItems,
        total_amount: Number(cartTotal || 0),
        status: "pending",
        order_type: type,
        customer_name: customerName ? customerName.trim() : null,
        notes: specialNotes ? specialNotes.trim() : "",
      };

      const { data, error } = await supabase
        .from("orders")
        .insert([newOrderPayload])
        .select();

      if (error) {
        console.error("Supabase Order Insert Error Details:", error);
        throw error;
      }

      if (data && data[0]) {
        localHandledOrderIds.current.add(data[0].id);
        printedItemCountsRef.current[data[0].id] = cleanedItems.length;
        triggerSafePrint(data[0] as Order, true);
      }

      setIsModalOpen(false);
      setCart([]);
      setCustomerName("");
      setSpecialNotes("");
      setOrderType("dine-in-1");
      fetchOrders();
    } catch (error: any) {
      console.error("Error placing order:", error);
      showError("Failed to create manual order: " + (error.message || "Database Error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Standard Print Receipt Calculation (Subtotal -> Service Charge -> Less Discount -> Total)
  const printSubtotal = (receiptOrder?.items || []).reduce(
    (sum: number, item: any) => sum + (Number(item.price || 0) * Number(item.quantity || 1)),
    0
  );
  const printIsDineIn = !receiptOrder?.order_type || receiptOrder?.order_type === 'dine-in';
  const printServiceCharge = printIsDineIn ? (printSubtotal * serviceChargePct) / 100 : 0;
  const printTax = (printSubtotal * taxPct) / 100;
  const printDiscount = Number(receiptOrder?.discount !== undefined ? receiptOrder.discount : calculatedDiscount);
  const printTotal = Math.max(0, printSubtotal + printServiceCharge + printTax - printDiscount);

  return (
    <ProtectedRoute>
      <div className="flex-1 flex flex-col font-sans overflow-hidden bg-slate-50 text-slate-900 pt-[72px] print:hidden">
        <Navbar rightActions={
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={handleFetchRecentBills}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold hover:bg-slate-200 transition-all whitespace-nowrap"
            >
              <Clock className="w-3.5 h-3.5 text-slate-500" /> Recent Bills
            </button>

            <button
              onClick={() => setIsPettyCashModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold hover:bg-rose-100 transition-all whitespace-nowrap"
            >
              💸 Log Outflow
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-sm shadow-orange-500/20 transition-all whitespace-nowrap"
              title="Shortcut: Press F12"
            >
              <Plus className="w-4 h-4" /> New Order <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono ml-1">F12</span>
            </button>
          </div>
        } />

        {errorToast.show && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-2 px-5 py-3 rounded-full shadow-xl font-bold text-sm whitespace-nowrap animate-in fade-in slide-in-from-top-4 no-print"
            style={{ background: errorToast.type === "error" ? "#e11d48" : "#1e293b", color: "#fff" }}
          >
            <X className="w-4 h-4 opacity-80" />
            {errorToast.message}
          </div>
        )}

        {showPaymentSuccess && lastSettledDetails && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 no-print"
            onClick={() => setShowPaymentSuccess(false)}
          >
            <div
              className="flex flex-col items-center justify-center bg-white rounded-[2.5rem] shadow-2xl px-10 py-10 gap-5 animate-in zoom-in-90 duration-300 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative flex items-center justify-center w-28 h-28">
                <div className="absolute w-24 h-24 rounded-full bg-emerald-100 animate-ping opacity-30" />
                <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-500/40 relative">
                  <svg className="w-10 h-10 text-white" viewBox="0 0 52 52" fill="none">
                    <style>{`
                      @keyframes draw-check-pay {
                        to { stroke-dashoffset: 0; }
                      }
                      .pay-check-path {
                        stroke-dasharray: 60;
                        stroke-dashoffset: 60;
                        animation: draw-check-pay 0.45s ease-out 0.1s forwards;
                      }
                    `}</style>
                    <path
                      className="pay-check-path"
                      d="M14 27l9 9 16-18"
                      stroke="white"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </div>
              </div>

              <div className="text-center space-y-1">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Payment Successful!</h2>
                <p className="text-sm font-semibold text-slate-500">
                  {lastSettledDetails.orderType === 'takeaway'
                    ? `Takeaway · #${lastSettledDetails.orderId.slice(0, 6).toUpperCase()}`
                    : lastSettledDetails.orderType === 'delivery'
                      ? `Delivery · #${lastSettledDetails.orderId.slice(0, 6).toUpperCase()}`
                      : `Table ${lastSettledDetails.tableNo} · #${lastSettledDetails.orderId.slice(0, 6).toUpperCase()}`}
                </p>
              </div>

              <div className="w-full bg-slate-50 rounded-2xl px-6 py-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Amount Paid</span>
                  <span className="text-xl font-black text-slate-900">
                    {currencySymbol} {lastSettledDetails.totalAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Method</span>
                  <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full">
                    {lastSettledDetails.paymentMethod}
                  </span>
                </div>
                {lastSettledDetails.change > 0 && (
                  <div className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-1">
                    <span className="text-sm font-black text-amber-700">Change to Return</span>
                    <span className="text-lg font-black text-amber-700">
                      {currencySymbol} {lastSettledDetails.change.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-emerald-400" style={{ animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>

              <button
                onClick={() => setShowPaymentSuccess(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                Tap anywhere to dismiss
              </button>
            </div>
          </div>
        )}

        {readyToast.show && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 fade-in duration-300">
            <div className="bg-emerald-500 text-white px-6 py-4 rounded-[2rem] shadow-[0_10px_40px_rgba(16,185,129,0.3)] flex items-center gap-3 border-2 border-emerald-400">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
              <span className="font-bold tracking-wide text-sm">{readyToast.message}</span>
              <button
                onClick={() => setReadyToast({ show: false, message: "" })}
                className="ml-2 p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Mobile Action Pill Bar */}
        <div className="lg:hidden px-3 sm:px-6 pt-3 pb-1">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
            <button
              onClick={handleFetchRecentBills}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white text-slate-700 border-2 border-slate-200 text-sm font-bold shadow-sm whitespace-nowrap shrink-0 active:scale-95 transition-all"
            >
              <Clock className="w-4 h-4 text-slate-500" /> Recent Bills
            </button>
            <button
              onClick={() => setIsPettyCashModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-rose-50 text-rose-600 border-2 border-rose-200 text-sm font-bold shadow-sm whitespace-nowrap shrink-0 active:scale-95 transition-all"
            >
              💸 Log Outflow
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-orange-500 text-white border-2 border-orange-600 text-sm font-bold shadow-sm shadow-orange-500/20 whitespace-nowrap shrink-0 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" /> New Order (F12)
            </button>
          </div>
        </div>

        {/* 3-Column Kanban Board */}
        <div className="grid grid-cols-12 gap-4 sm:gap-6 h-[calc(100vh-85px)] px-3 sm:px-6 py-4 no-print overflow-hidden">
          {/* Column 1: Dine-in Tables */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-4 bg-white border border-slate-100 flex flex-col z-10 shadow-sm rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 tracking-wide text-lg">
                <UtensilsCrossed className="w-5 h-5 text-indigo-500" /> Dine-in Tables
              </h2>
              <div className="text-xs font-bold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                {tables.filter((t: any) => orders.some(o => o.table_no === String(t.id) && (!o.order_type || o.order_type === 'dine-in'))).length} / {tables.length} Occupied
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-3.5">
                {tables.map((tableObj: any) => {
                  const tableNo = String(tableObj.id);
                  const tableName = tableObj.name || `Table ${tableNo.padStart(2, "0")}`;
                  const tableOrders = orders.filter(o => o.table_no === tableNo && (!o.order_type || o.order_type === 'dine-in'));
                  const activeOrder = tableOrders[0];

                  if (activeOrder) {
                    return (
                      <div
                        key={tableNo}
                        onClick={() => setSelectedOrderId(activeOrder.id)}
                        className={`h-28 rounded-2xl p-4 border-2 cursor-pointer flex flex-col justify-between transition-all group shadow-sm hover:shadow-md ${selectedOrderId === activeOrder.id ? 'ring-4 ring-orange-500/20 shadow-orange-500/20' : ''
                          } ${activeOrder.status === 'Ready' ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-500 shadow-lg shadow-emerald-500/20 animate-pulse ring-4 ring-emerald-400/40' :
                            'border-orange-400 bg-orange-50 shadow-[0_0_15px_rgba(251,146,60,0.15)]'
                          }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-2xl text-slate-900 flex items-center gap-2">
                            {tableName}
                            {activeOrder.status === 'Ready' && (
                              <CheckCircle className="w-5 h-5 text-emerald-500 fill-emerald-100" />
                            )}
                          </span>
                          <div className="text-xs font-bold text-slate-500 flex flex-col items-end">
                            <span>{activeOrder.items?.length || 0} Items</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-end text-sm mt-2">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 tracking-tight text-lg">{currencySymbol} {activeOrder.total_amount?.toLocaleString()}</span>
                            {billedOrders.has(activeOrder.id) && (
                              <span className="text-[10px] uppercase font-bold text-orange-600 tracking-wider mt-0.5">Waiting Payment</span>
                            )}
                          </div>
                          <ElapsedTime startTime={activeOrder.created_at} />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={tableNo} className="h-28 rounded-2xl p-4 border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-100 shadow-sm cursor-default group">
                      <span className="font-bold text-2xl mb-1 group-hover:text-slate-600 transition-colors">{tableName}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full ring-1 ring-slate-200 group-hover:bg-slate-200 transition-colors">{tableObj.capacity || 4} Seats</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Column 2: Pickups & Delivery Hub */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-4 bg-white border border-slate-100 flex flex-col z-10 shadow-sm rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 tracking-wide text-lg">
                <ShoppingBag className="w-5 h-5 text-orange-500" /> Pickups & Delivery
              </h2>
              <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm">
                {orders.filter(o => (o.order_type === 'takeaway' || o.order_type === 'delivery') && o.status?.toLowerCase() !== 'completed').length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-3">
              {orders.filter(o => (o.order_type === 'takeaway' || o.order_type === 'delivery') && o.status?.toLowerCase() !== 'completed').map((order, index) => {
                const isReady = order.status === 'Ready';
                return (
                  <div
                    key={`${order.id}-${index}`}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`p-3 rounded-2xl border-2 cursor-pointer transition-all shadow-sm relative overflow-hidden ${isReady ? 'bg-emerald-50 border-emerald-500 shadow-lg shadow-emerald-500/10' :
                      selectedOrderId === order.id ? 'border-orange-500 ring-4 ring-orange-500/10 bg-white' : 'border-slate-200 bg-white hover:border-orange-300'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg tracking-widest shadow-sm ${order.order_type === 'delivery' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-white'
                        }`}>
                        {order.order_type === 'delivery' ? <Bike className="w-3 h-3 inline mr-1" /> : <ShoppingBag className="w-3 h-3 inline mr-1" />}
                        {order.order_type}
                      </span>
                      <span className="font-bold text-slate-900">{currencySymbol} {order.total_amount?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-end mt-2">
                      <span className="font-bold text-slate-700 truncate mr-2 text-base">{order.customer_name || 'Walk-in Customer'}</span>
                      <div className="flex items-center gap-2">
                        {!isReady && (
                          <span className="bg-orange-100 text-orange-700 text-[10px] uppercase font-bold px-2 py-1 rounded-md shadow-sm">In Kitchen</span>
                        )}
                        <ElapsedTime startTime={order.created_at} />
                      </div>
                    </div>
                    {isReady && (
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <div className="flex items-center text-[10px] font-bold text-emerald-700 tracking-widest mb-2">
                          <span className="relative flex h-2.5 w-2.5 mr-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                          {order.order_type === 'delivery' ? 'READY TO HAND OVER' : 'READY FOR PICKUP'}
                        </div>
                        <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold transition-colors shadow-sm active:scale-95">
                          View & Bill
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {orders.filter(o => (o.order_type === 'takeaway' || o.order_type === 'delivery') && o.status?.toLowerCase() !== 'completed').length === 0 && (
                <div className="text-center p-5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-sm">
                  No active pickups
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Bill Preview & Settlement */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-4 bg-white flex flex-col z-10 border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 tracking-wide text-lg">
                <Printer className="w-5 h-5 text-emerald-500" /> Settlement
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col bg-slate-50/50">
              {selectedOrder ? (
                <div className="w-full flex flex-col gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">ORDER ID: {selectedOrder.id.substring(0, 5).toUpperCase()}</p>
                      <h3 className="text-2xl font-bold text-slate-900">{selectedOrder.order_type === 'takeaway' || selectedOrder.order_type === 'delivery' ? selectedOrder.order_type.toUpperCase() : `Table ${selectedOrder.table_no}`}</h3>
                    </div>
                    <div className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-bold text-sm shadow-sm">
                      {selectedOrder.status}
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                    <h4 className="font-bold text-slate-700 text-sm border-b border-slate-100 pb-2 uppercase tracking-widest">Order Items</h4>
                    {consolidateItems(selectedOrder.items || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm font-medium pt-1">
                        <div className="flex gap-3">
                          <span className="font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md">{item.quantity}x</span>
                          <span className="text-slate-800 font-bold">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-900">{currencySymbol} {(item.quantity * item.price).toLocaleString()}</span>
                          {selectedOrder.status?.toLowerCase() !== 'completed' && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleUpdateItemQuantity(selectedOrder.id, item.id, -1)} className="p-1 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-200 rounded-md transition-colors" title="Decrease Quantity"><Minus className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleUpdateItemQuantity(selectedOrder.id, item.id, 0)} className="p-1 text-rose-400 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors" title="Remove Item"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Breakdown according to Industry Standard */}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-2 text-sm font-bold text-slate-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{currencySymbol} {selectedOrderSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>

                    {(!selectedOrder.order_type || selectedOrder.order_type === 'dine-in') && (
                      <div className="flex justify-between text-slate-500">
                        <span>Service Charge ({serviceChargePct}% on Subtotal):</span>
                        <span>{currencySymbol} {selectedOrderServiceCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {taxPct > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Tax ({taxPct}% on Subtotal):</span>
                        <span>{currencySymbol} {selectedOrderTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {calculatedDiscount > 0 && (() => {
                      const discountPct = Math.round((calculatedDiscount / selectedOrderSubtotal) * 100);
                      const isLikelyPercent = discountPct > 0 && Math.abs(calculatedDiscount - ((selectedOrderSubtotal * discountPct) / 100)) < 0.1;
                      return (
                        <div className="flex justify-between text-rose-500 bg-rose-50 px-2 py-1 rounded-lg -mx-2">
                          <span>Discount {isLikelyPercent ? `(${discountPct}%)` : `(Fixed)`}</span>
                          <span>-{currencySymbol} {calculatedDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      );
                    })()}

                    <div className="flex justify-between text-2xl text-slate-900 pt-4 border-t border-slate-200 mt-3">
                      <span>Total Amount</span>
                      <span className="text-emerald-600">{currencySymbol} {finalGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Printer className="w-16 h-16 mb-4 opacity-20" />
                  <p className="font-bold tracking-wide">Select a table or order</p>
                </div>
              )}
            </div>

            {selectedOrder && (
              <div className="p-5 bg-white border-t border-slate-100 flex flex-col gap-3">
                {/* Quick Discounts */}
                <div className="mb-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Quick Discount</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 5, 10].map(pct => (
                      <button
                        key={pct}
                        onClick={() => { setDiscountType("percent"); setDiscountValue(pct); }}
                        className={`py-1.5 rounded-lg text-sm font-bold border ${discountType === 'percent' && discountValue === pct ? 'bg-orange-100 border-orange-500 text-orange-600' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setCustomDiscountInput(discountValue > 0 ? String(discountValue) : "");
                        setShowCustomDiscountModal(true);
                      }}
                      className={`py-1.5 rounded-lg text-sm font-bold border ${![0, 5, 10].includes(discountValue) && discountValue > 0 ? 'bg-orange-100 border-orange-500 text-orange-600' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    >
                      {![0, 5, 10].includes(discountValue) && discountValue > 0
                        ? (discountType === 'percent' ? `${discountValue}%` : `${currencySymbol}${discountValue}`)
                        : 'Custom'}
                    </button>
                  </div>

                  {/* Inline Custom Discount Modal */}
                  {showCustomDiscountModal && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print">
                      <div className="bg-white w-full max-w-xs rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-6">
                        <h3 className="font-bold text-slate-900 text-lg mb-3">Custom Discount</h3>

                        <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
                          <button
                            onClick={() => setDiscountType("percent")}
                            className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-colors ${discountType === 'percent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            % Percent
                          </button>
                          <button
                            onClick={() => setDiscountType("fixed")}
                            className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-colors ${discountType === 'fixed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            {currencySymbol} Fixed
                          </button>
                        </div>

                        <p className="text-xs text-slate-500 font-medium mb-3">
                          {discountType === 'percent' ? "Enter discount percentage (%)" : `Enter fixed amount in ${currencySymbol}`}
                        </p>
                        <input
                          type="number"
                          min="0"
                          max={discountType === 'percent' ? "100" : undefined}
                          value={customDiscountInput}
                          onChange={(e) => setCustomDiscountInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setShowCustomDiscountModal(false);
                            if (e.key === 'Enter') {
                              let v = Number(customDiscountInput);
                              if (!isNaN(v) && v >= 0 && selectedOrder) {
                                if (discountType === 'percent' && v > 100) v = 100;
                                const calcDiscount = discountType === 'percent' ? (selectedOrderSubtotal * v) / 100 : v;
                                const isDineIn = !selectedOrder.order_type || selectedOrder.order_type === 'dine-in';
                                const sChargePct = Number(settings?.service_charge_pct ?? 10);
                                const tPct = Number(settings?.tax_pct ?? 0);
                                const sCharge = isDineIn ? (selectedOrderSubtotal * sChargePct) / 100 : 0;
                                const tax = (selectedOrderSubtotal * tPct) / 100;
                                const grandTotal = Math.max(0, selectedOrderSubtotal + sCharge + tax - calcDiscount);

                                setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, discount: calcDiscount, total_amount: grandTotal } : o));

                                supabase.from("orders").update({
                                  discount: calcDiscount,
                                  total_amount: grandTotal
                                }).eq("id", selectedOrder.id);

                                setDiscountValue(v);
                              }
                              setShowCustomDiscountModal(false);
                            }
                          }}
                          autoFocus
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
                          placeholder="0"
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => setShowCustomDiscountModal(false)}
                            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              let v = Number(customDiscountInput);
                              if (!isNaN(v) && v >= 0 && selectedOrder) {
                                if (discountType === 'percent' && v > 100) v = 100;
                                const calcDiscount = discountType === 'percent' ? (selectedOrderSubtotal * v) / 100 : v;
                                const isDineIn = !selectedOrder.order_type || selectedOrder.order_type === 'dine-in';
                                const sChargePct = Number(settings?.service_charge_pct ?? 10);
                                const tPct = Number(settings?.tax_pct ?? 0);
                                const sCharge = isDineIn ? (selectedOrderSubtotal * sChargePct) / 100 : 0;
                                const tax = (selectedOrderSubtotal * tPct) / 100;
                                const grandTotal = Math.max(0, selectedOrderSubtotal + sCharge + tax - calcDiscount);

                                setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, discount: calcDiscount, total_amount: grandTotal } : o));

                                await supabase.from("orders").update({
                                  discount: calcDiscount,
                                  total_amount: grandTotal
                                }).eq("id", selectedOrder.id);

                                setDiscountValue(v);
                              }
                              setShowCustomDiscountModal(false);
                            }}
                            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {selectedOrder.order_type === 'takeaway' || selectedOrder.order_type === 'delivery' ? (
                  <button
                    onClick={() => setPaymentModalOrderId(selectedOrder.id)}
                    className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all shadow-[0_8px_20px_rgba(249,115,22,0.3)] flex items-center justify-center gap-2 tracking-wide active:scale-95 text-lg"
                  >
                    <CheckCircle className="w-6 h-6" /> ⚡ Settle & Pay
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handlePrintBill(selectedOrder.id)}
                      className="w-full py-3 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl transition-colors border-2 border-slate-200 flex items-center justify-center gap-2 text-sm tracking-wide shadow-sm"
                    >
                      <Printer className="w-4 h-4" /> 🖨️ Print Customer Bill
                    </button>
                    <button
                      onClick={() => setPaymentModalOrderId(selectedOrder.id)}
                      className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all shadow-[0_8px_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 tracking-wide active:scale-95 text-base"
                    >
                      <CheckCircle className="w-5 h-5" /> ✅ Settle & Mark Paid
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Payment Modal */}
        {(paymentModalOrderId || stagedDirectOrder) && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setPaymentModalOrderId(null);
                setStagedDirectOrder(null);
                setShowSplitPayment(false);
                setSplitCashAmount("");
                setShowCashCalculator(false);
                setCashGiven("");
              }
            }}
          >
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">Select Payment</h2>
                <button
                  onClick={() => {
                    setPaymentModalOrderId(null);
                    setStagedDirectOrder(null);
                    setShowSplitPayment(false);
                    setSplitCashAmount("");
                    setShowCashCalculator(false);
                    setCashGiven("");
                  }}
                  className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="text-center mb-6">
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Amount Due</p>
                  <p className="text-3xl font-bold text-slate-900">{currencySymbol} {(stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                {!showSplitPayment && !showCashCalculator ? (
                  <>
                    <button
                      onClick={() => setShowCashCalculator(true)}
                      className="w-full py-4 bg-white border-2 border-orange-200 hover:border-orange-500 hover:bg-orange-50 rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-sm"
                    >
                      <span className="text-2xl">💵</span>
                      <span className="font-bold text-lg text-slate-800">Cash Full</span>
                    </button>
                    <button
                      onClick={() => handleSettlePayment("Card")}
                      className="w-full py-4 bg-white border-2 border-indigo-200 hover:border-indigo-500 hover:bg-indigo-50 rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-sm"
                    >
                      <span className="text-2xl">💳</span>
                      <span className="font-bold text-lg text-slate-800">Card Full</span>
                    </button>
                    <button
                      onClick={() => setShowSplitPayment(true)}
                      className="w-full py-4 bg-slate-50 border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-sm mt-2"
                    >
                      <span className="text-2xl">🍕</span>
                      <span className="font-bold text-lg text-slate-800">Split Payment</span>
                    </button>
                  </>
                ) : showCashCalculator ? (
                  <form
                    className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (isSubmitting || (cashGiven !== "" && Number(cashGiven || 0) < (stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal))) return;
                      handleSettlePayment("Cash");
                    }}
                  >
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cash Tendered / Customer Paid</label>
                      <input
                        type="number"
                        placeholder="Enter amount received"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        className="w-full bg-white border-2 border-slate-200 rounded-xl p-3 font-bold text-slate-900 focus:border-orange-500 outline-none text-center text-lg shadow-sm"
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setCashGiven(String(stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal))} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-700">Exact</button>
                      <button type="button" onClick={() => setCashGiven(String(Math.ceil((stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal) / 500) * 500))} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-700">Nearest 500</button>
                      <button type="button" onClick={() => setCashGiven("1000")} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-700">1,000</button>
                      <button type="button" onClick={() => setCashGiven("5000")} className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-700">5,000</button>
                    </div>

                    <div className="p-4 rounded-xl border flex flex-col justify-center items-center">
                      {Number(cashGiven || 0) >= (stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal) ? (
                        <div className="text-center text-emerald-600 bg-emerald-50 w-full p-2 rounded-lg border border-emerald-100">
                          <span className="block text-xs font-bold uppercase tracking-widest mb-1">Change to Return</span>
                          <span className="font-bold text-2xl">{currencySymbol} {(Number(cashGiven) - (stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ) : (
                        <div className="text-center text-rose-500 bg-rose-50 w-full p-2 rounded-lg border border-rose-100">
                          <span className="block text-xs font-bold uppercase tracking-widest mb-1">Remaining Due</span>
                          <span className="font-bold text-2xl">{currencySymbol} {((stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal) - Number(cashGiven || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || (cashGiven !== "" && Number(cashGiven || 0) < (stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal))}
                      className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-md active:scale-95 flex justify-center items-center gap-2"
                    >
                      {isSubmitting ? "Processing..." : "Confirm Settle Cash"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCashCalculator(false); setCashGiven(""); }}
                      className="w-full py-2 text-slate-500 hover:text-slate-700 font-bold text-sm"
                    >
                      Back to Options
                    </button>
                  </form>
                ) : (
                  <form
                    className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const amountDue = stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal;
                      const cashAmt = Number(splitCashAmount || 0);
                      const cardAmt = Math.max(0, amountDue - cashAmt);
                      const cashExceedsTotal = splitCashAmount !== "" && cashAmt >= amountDue;
                      const isInvalid = !splitCashAmount || isNaN(cashAmt) || cashAmt <= 0 || cashExceedsTotal;

                      if (!isInvalid && !isSubmitting) {
                        handleSettlePayment(`Split (Cash: ${cashAmt}, Card: ${cardAmt})`);
                      }
                    }}
                  >
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cash Amount Received</label>
                      <input
                        type="number"
                        placeholder="Amount in Cash"
                        value={splitCashAmount}
                        onChange={(e) => setSplitCashAmount(e.target.value)}
                        className="w-full bg-white border-2 border-slate-200 rounded-xl p-3 font-bold text-slate-900 focus:border-orange-500 outline-none text-center text-lg shadow-sm"
                        autoFocus
                      />
                    </div>

                    {(() => {
                      const amountDue = stagedDirectOrder ? stagedDirectOrder.total_amount : finalGrandTotal;
                      const cashAmt = Number(splitCashAmount || 0);
                      const cardAmt = Math.max(0, amountDue - cashAmt);
                      const cashExceedsTotal = splitCashAmount !== "" && cashAmt >= amountDue;
                      const splitMismatch = splitCashAmount !== "" && cashAmt > 0 && cashAmt < amountDue && (cashAmt + cardAmt) !== amountDue;
                      const isInvalid = !splitCashAmount || isNaN(cashAmt) || cashAmt <= 0 || cashExceedsTotal;

                      return (
                        <>
                          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center text-indigo-900">
                            <span className="font-bold">Card Amount:</span>
                            <span className={`font-bold text-xl ${cashExceedsTotal ? "text-rose-500 line-through" : ""}`}>
                              {currencySymbol} {cardAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>

                          {cashExceedsTotal && (
                            <div className="text-center text-xs font-bold text-rose-500 bg-rose-50 p-3 rounded-xl border border-rose-100 animate-in slide-in-from-top-1">
                              ⚠️ Cash amount cannot exceed total amount due in split payment. Use full cash payment instead.
                            </div>
                          )}

                          {splitMismatch && (
                            <div className="text-center text-xs font-bold text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 animate-in slide-in-from-top-1">
                              ⚠️ Cash + Card must equal exactly {currencySymbol} {amountDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={isInvalid || isSubmitting}
                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-md active:scale-95"
                          >
                            {isSubmitting ? "Processing..." : "Confirm Split Payment"}
                          </button>
                        </>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() => setShowSplitPayment(false)}
                      className="w-full py-2 text-slate-500 hover:text-slate-700 font-bold text-sm"
                    >
                      Back to Options
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent Bills Modal */}
        {showRecentBills && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print">
            <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-500" /> Recent Completed Bills
                </h2>
                <button
                  onClick={() => setShowRecentBills(false)}
                  className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-0 overflow-y-auto max-h-[60vh]">
                {recentBills.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {recentBills.map(bill => {
                      const subtotal = (bill.items || []).reduce(
                        (sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0
                      );
                      const discount = Number(bill.discount || 0);
                      const isDineIn = !bill.order_type || bill.order_type === 'dine-in';
                      const sCharge = isDineIn ? (subtotal * serviceChargePct) / 100 : 0;
                      const tax = (subtotal * taxPct) / 100;
                      const grandTotal = Math.max(0, subtotal + sCharge + tax - discount);

                      return (
                        <div key={bill.id} className="p-5 hover:bg-slate-50 transition-colors flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-slate-900">
                                  {bill.order_type === 'takeaway' ? 'Pickup' : bill.order_type === 'delivery' ? 'Delivery' : `Table ${bill.table_no}`}
                                </span>
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-bold">Paid</span>
                              </div>
                              <p className="text-sm text-slate-500 font-medium">
                                {new Date(bill.created_at).toLocaleString()} • {bill.payment_method || 'Unknown'}
                              </p>
                            </div>
                            <button
                              onClick={() => handleReprint(bill)}
                              className="p-2 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-lg transition-colors"
                              title="Preview & Reprint"
                            >
                              <Printer className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="bg-slate-100 p-3 rounded-xl text-xs font-bold text-slate-600 flex flex-col gap-1">
                            <div className="flex justify-between"><span>Subtotal:</span><span>{currencySymbol} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                            {isDineIn && <div className="flex justify-between"><span>Service Charge ({serviceChargePct}%):</span><span>{currencySymbol} {sCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                            {taxPct > 0 && <div className="flex justify-between"><span>Tax ({taxPct}%):</span><span>{currencySymbol} {tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                            {discount > 0 && <div className="flex justify-between text-rose-500"><span>Discount:</span><span>-{currencySymbol} {discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                            <div className="flex justify-between text-sm text-slate-900 border-t border-slate-200 pt-1 mt-1">
                              <span>Grand Total:</span>
                              <span className="text-emerald-600">{currencySymbol} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-10 text-center text-slate-500 font-bold">
                    No recently completed bills found.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Petty Cash Modal */}
        {isPettyCashModalOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setIsPettyCashModalOpen(false);
              }
            }}
          >
            <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">Log Petty Cash / Outflow</h2>
                <button
                  type="button"
                  onClick={() => setIsPettyCashModalOpen(false)}
                  className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                className="p-6 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!pettyCashForm.amount || !pettyCashForm.reason || !pettyCashForm.receivedBy || isSubmitting) return;
                  setIsSubmitting(true);
                  const entry = {
                    amount: Number(pettyCashForm.amount),
                    reason: pettyCashForm.reason,
                    staff_name: pettyCashForm.receivedBy
                  };

                  const { data, error } = await supabase.from('petty_cash_logs').insert([entry]).select();
                  setIsSubmitting(false);

                  if (error) {
                    showError('Error logging petty cash: ' + error.message);
                  } else {
                    const inserted = data ? data[0] : { ...entry, id: 'PC-' + Date.now(), created_at: new Date().toISOString() };
                    setVoucherData(inserted);
                    setPettyCashForm({ amount: "", reason: "", receivedBy: "" });
                    setIsPettyCashModalOpen(false);

                    const cleanupVoucherPrint = () => {
                      setVoucherData(null);
                      window.removeEventListener('afterprint', cleanupVoucherPrint);
                    };
                    window.addEventListener('afterprint', cleanupVoucherPrint, { once: true });
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        window.print();
                      });
                    });
                  }
                }}
              >
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Amount ({currencySymbol}) *</label>
                  <input
                    type="number"
                    value={pettyCashForm.amount}
                    onChange={(e) => setPettyCashForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="e.g. 1500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Reason / Category *</label>
                  <input
                    type="text"
                    value={pettyCashForm.reason}
                    onChange={(e) => setPettyCashForm(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="e.g. Emergency Groceries"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Received By / Paid To *</label>
                  <input
                    type="text"
                    value={pettyCashForm.receivedBy}
                    onChange={(e) => setPettyCashForm(prev => ({ ...prev, receivedBy: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="e.g. Kamal / Delivery Rider / Supplier"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!pettyCashForm.amount || !pettyCashForm.reason || !pettyCashForm.receivedBy || isSubmitting}
                  className="w-full py-4 mt-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-[0_8px_20px_rgba(239,68,68,0.3)]"
                >
                  {isSubmitting ? "Logging..." : "Confirm Cash Outflow"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Manual Order Modal - Fully Responsive & Mobile Optimized */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 lg:p-6 overflow-hidden">
            <div className="w-full max-w-7xl h-full sm:h-[90vh] bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col lg:flex-row overflow-hidden border-0 sm:border border-slate-200 relative animate-in zoom-in-95 duration-200">

              {/* Close Button */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 z-40 transition-colors shadow-sm"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              {/* 1. Categories Sidebar: Perfectly scrollable on desktop & mobile */}
              <div className="w-full lg:w-48 xl:w-56 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0 min-h-0">
                <div className="hidden lg:block p-4 border-b border-slate-200/80 bg-white shrink-0">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Categories</span>
                </div>

                {/* Vertical scrollable on desktop with smooth mousewheel & drag, Horizontal on mobile */}
                <div className="flex lg:flex-col overflow-x-auto lg:overflow-y-auto no-scrollbar lg:max-h-[calc(90vh-65px)] p-2 lg:p-2.5 gap-1.5 lg:space-y-1 shrink-0 flex-1 min-h-0">
                  {menuCategories.map((cat) => {
                    const isSelected = activeCategory === cat;
                    const isSpecialTab = cat === "⭐ Favorites" || cat === "🔥 Fast Moving";
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`text-left px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center justify-between shrink-0 cursor-pointer ${isSelected
                          ? "bg-orange-500 text-white shadow-md shadow-orange-500/30 scale-[1.01]"
                          : isSpecialTab
                            ? "bg-orange-50/80 text-orange-700 hover:bg-orange-100/80 border border-orange-200/60 lg:border-transparent"
                            : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 bg-white lg:bg-transparent border border-slate-200 lg:border-transparent"
                          }`}
                      >
                        <span className="truncate">{cat}</span>
                        {isSelected && <span className="hidden lg:inline-block w-1.5 h-1.5 rounded-full bg-white ml-2 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Middle Section: Search & Food Dishes Grid */}
              <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-200">
                <div className="p-3 sm:p-5 border-b border-slate-100 flex items-center gap-3 shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder={`Search in ${activeCategory}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 outline-none transition-all font-medium text-slate-900 text-xs sm:text-sm"
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-2 rounded-xl shrink-0">
                    {filteredMenu.length} items
                  </span>
                </div>

                <div className="flex-1 p-3 sm:p-4 overflow-y-auto will-change-scroll bg-slate-50/40 pb-24 lg:pb-4">
                  {filteredMenu.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                      <UtensilsCrossed className="w-12 h-12 mb-3 opacity-20" />
                      <p className="font-bold text-sm text-slate-500">No items found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {activeCategory === "⭐ Favorites"
                          ? "Click the star (⭐) icon on any dish to add to favorites!"
                          : activeCategory === "🔥 Fast Moving"
                            ? "Completed order sales will automatically show top sellers here!"
                            : "Try selecting another category or clear search filter."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredMenu.map((item) => {
                        const isFav = favoriteIds.includes(item.id);
                        return (
                          <div key={item.id} className="relative group">
                            <button
                              type="button"
                              onClick={(e) => toggleFavorite(item.id, e)}
                              title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                              className={`absolute top-2 right-2 z-20 p-1.5 rounded-full shadow-sm transition-all active:scale-90 ${isFav
                                ? "bg-amber-400 text-white shadow-amber-400/40"
                                : "bg-white/90 text-slate-400 hover:text-amber-500 hover:bg-white"
                                }`}
                            >
                              <Star className={`w-3.5 h-3.5 ${isFav ? "fill-white stroke-white" : "stroke-[2.5]"}`} />
                            </button>

                            <MenuItemCard
                              item={item}
                              currencySymbol={currencySymbol}
                              onAddToCart={handleAddCardToCart}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Right Section: Cart & Order Details */}
              <div className={`w-full lg:w-[380px] xl:w-[420px] bg-white flex flex-col relative shrink-0 min-h-0 overflow-hidden ${isMobileCartExpanded ? 'fixed inset-0 z-50 h-full' : 'hidden lg:flex'
                }`}>

                {/* Header with Mobile Close button */}
                <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 flex justify-between items-center">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-orange-500" /> Order Details
                  </h2>
                  {isMobileCartExpanded && (
                    <button
                      onClick={() => setIsMobileCartExpanded(false)}
                      className="lg:hidden p-1.5 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Order Type & Table</label>
                      <div className="relative">
                        <select
                          value={orderType}
                          onChange={(e) => setOrderType(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 font-bold text-slate-900 focus:border-orange-500 outline-none shadow-sm text-xs appearance-none cursor-pointer"
                        >
                          <option value="takeaway">🛍️ Takeaway</option>
                          <option value="delivery">🛵 Delivery</option>
                          <optgroup label="Dine-in Tables">
                            {tables.map(t => {
                              const tableNum = typeof t === 'object' ? String((t as any).id) : String(t);
                              return (
                                <option key={tableNum} value={`dine-in-${tableNum}`}>
                                  🍽️ Table {tableNum.padStart(2, '0')}
                                </option>
                              );
                            })}
                          </optgroup>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Customer Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Kasun / Nimal"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-900 focus:border-orange-500 outline-none shadow-sm placeholder:text-slate-400 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-6">
                      <ShoppingBag className="w-12 h-12 mb-2 opacity-20" />
                      <p className="font-bold text-xs tracking-wide">Cart is empty</p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.name} className="flex justify-between items-center bg-white p-2.5 rounded-xl shadow-sm border border-slate-100">
                        <div className="flex-1 pr-2">
                          <h4 className="font-bold text-slate-900 text-xs leading-tight line-clamp-1">{item.name}</h4>
                          <p className="text-orange-500 font-bold text-xs mt-0.5">{currencySymbol} {(item.price * item.quantity).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg p-1 border border-slate-200">
                          <button
                            onClick={() => updateCart(item, -1)}
                            className="w-6 h-6 flex items-center justify-center bg-white rounded text-slate-700 shadow-sm border border-slate-100 active:scale-90"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-4 text-center font-bold text-slate-900 text-xs">{item.quantity}</span>
                          <button
                            onClick={() => updateCart(item, 1)}
                            className="w-6 h-6 flex items-center justify-center bg-orange-500 text-white rounded shadow-sm active:scale-90"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {cart.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <textarea
                        value={specialNotes}
                        onChange={(e) => setSpecialNotes(e.target.value)}
                        placeholder="Special notes (e.g., No onions)..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:border-orange-500 outline-none font-medium shadow-inner placeholder:text-slate-400"
                        rows={2}
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
                  <div className="space-y-1.5 mb-3 text-xs font-bold text-slate-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{currencySymbol} {cartSubtotal.toLocaleString()}</span>
                    </div>
                    {isDineInCart && (
                      <div className="flex justify-between text-slate-500">
                        <span>Service Charge ({serviceChargePct}%)</span>
                        <span>{currencySymbol} {cartServiceCharge.toLocaleString()}</span>
                      </div>
                    )}
                    {taxPct > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Tax ({taxPct}%):</span>
                        <span>{currencySymbol} {cartTax.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base text-slate-900 pt-2 border-t border-slate-200 mt-1">
                      <span>Total</span>
                      <span className="text-orange-500 font-extrabold">{currencySymbol} {cartTotal.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => submitManualOrder(false)}
                      disabled={isSubmitting || cart.length === 0}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 text-xs sm:text-sm"
                    >
                      {isSubmitting ? "Processing..." : "Send to Kitchen"}
                    </button>
                    <button
                      onClick={() => {
                        if (cart.length === 0) { showError("Cart is empty!", "info"); return; }
                        const isDineIn = orderType.startsWith('dine-in-');
                        const tableNumber = isDineIn ? orderType.replace('dine-in-', '') : null;
                        const type = isDineIn ? "dine-in" : orderType;
                        setStagedDirectOrder({
                          table_no: tableNumber,
                          items: cart,
                          total_amount: cartTotal,
                          order_type: type,
                          customer_name: customerName || null,
                          special_notes: specialNotes || null,
                        });
                      }}
                      disabled={isSubmitting || cart.length === 0}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 text-xs sm:text-sm"
                    >
                      ⚡ Direct Settle & Bill (Counter Food)
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Floating Bottom Cart Bar */}
              {cart.length > 0 && !isMobileCartExpanded && (
                <div className="lg:hidden absolute bottom-3 left-3 right-3 z-40 bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between animate-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center font-black text-sm">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cart Total</p>
                      <p className="text-base font-black text-white">{currencySymbol} {cartTotal.toLocaleString()}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsMobileCartExpanded(true)}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
                  >
                    View Cart & Order →
                  </button>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Standalone 80mm Printable Receipt */}
      <div
        id="print-receipt"
        data-printable="true"
        className="hidden print:block fixed inset-0 top-0 left-0 w-[80mm] min-h-screen bg-white text-black p-3 font-mono text-xs z-[99999]"
      >
        {kotPrintData ? (
          <div className="w-[72mm] font-mono text-black">
            <div className="text-center font-black text-sm border-b-2 border-dashed border-black pb-2 mb-2">
              {(kotPrintData.notes?.includes('[RUNNING KOT / ADD-ON]') || kotPrintData.notes?.includes('[RE-ORDER]')) ? '*** RUNNING KOT (ADD-ON) ***' : '*** KITCHEN ORDER (KOT) ***'}
            </div>
            <div className="flex justify-between font-black text-sm mb-1">
              <span>{kotPrintData.order_type === 'dine-in' ? `TABLE ${kotPrintData.table_no}` : (kotPrintData.order_type || 'TAKEAWAY').toUpperCase()}</span>
              <span>#{kotPrintData.id?.slice(0, 5).toUpperCase()}</span>
            </div>
            {kotPrintData.customer_name && (
              <p className="text-[10px] font-bold">Customer: {kotPrintData.customer_name}</p>
            )}
            <div className="text-[10px] mb-2 font-medium">Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            <div className="border-b-2 border-black my-1"></div>

            <table className="w-full text-xs font-bold my-2">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1">Item</th>
                  <th className="py-1 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {(kotPrintData.items || []).map((item: any, i: number) => (
                  <tr key={i} className="border-b border-dotted border-gray-400">
                    <td className="py-1.5 pr-2 font-black text-sm leading-tight">{item.name}</td>
                    <td className="py-1.5 text-right font-black text-base">{item.quantity}x</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {kotPrintData.notes && (
              <div className="border-t border-dashed border-black pt-2 mt-2 text-xs font-bold">
                * Note: {kotPrintData.notes}
              </div>
            )}
            <div className="border-b-2 border-dashed border-black mt-3 pt-2 text-center text-[10px]">
              --- END OF KOT ---
            </div>
          </div>
        ) : voucherData ? (
          <div className="w-[72mm] font-mono text-black text-center">
            <h2 className="text-base font-black tracking-tight">{settings.name || 'Restaurant POS'}</h2>
            <p className="text-[10px] uppercase font-bold border-b border-dashed border-black pb-1 mb-2">Petty Cash Voucher</p>
            <div className="text-left space-y-1.5 mb-3 text-xs">
              <p><strong>Reason:</strong> {voucherData.reason}</p>
              <p><strong>Received By:</strong> {voucherData.staff_name || voucherData.received_by || "Staff"}</p>
              <p><strong>Amount:</strong> {currencySymbol} {Number(voucherData.amount).toLocaleString()}</p>
              <p className="text-[10px] text-gray-600">Date: {new Date(voucherData.created_at || Date.now()).toLocaleString()}</p>
            </div>
            <p className="text-[9px] border-t border-dashed border-black pt-4 mt-6">Signature: ______________________</p>
          </div>
        ) : receiptOrder ? (
          <div className="w-[72mm] font-mono text-black">
            <div className="text-center mb-3 pb-2 border-b-2 border-dashed border-black">
              <h1 className="text-base font-black tracking-tight">{settings.name || 'Restaurant POS'}</h1>
              <p className="text-[10px] uppercase font-bold tracking-widest">{settings.tagline}</p>
              <p className="text-[10px]">Tel: {settings.phone || '+94 77 123 4567'}</p>
            </div>

            <div className="text-[11px] mb-2 pb-2 border-b border-dashed border-black space-y-0.5">
              <div className="flex justify-between font-bold">
                <span>{receiptOrder.order_type === 'takeaway' ? 'ORDER: TAKEAWAY' : receiptOrder.order_type === 'delivery' ? 'ORDER: DELIVERY' : `TABLE: ${receiptOrder.table_no}`}</span>
                <span>#{receiptOrder.id.slice(0, 5).toUpperCase()}</span>
              </div>
              {receiptOrder.customer_name && <p>Customer: {receiptOrder.customer_name}</p>}
              <p>Date: {new Date(receiptOrder.created_at || Date.now()).toLocaleString()}</p>
            </div>

            <table className="w-full text-[11px] mb-2 border-b border-dashed border-black">
              <thead>
                <tr className="border-b border-black text-left font-bold">
                  <th className="py-1">Item</th>
                  <th className="py-1 text-center">Qty</th>
                  <th className="py-1 text-right">Amt</th>
                </tr>
              </thead>
              <tbody className="text-[11px]">
                {(receiptOrder.items || []).map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-dotted border-gray-300">
                    <td className="py-1 pr-1 font-bold">{item.name}</td>
                    <td className="py-1 text-center font-bold">{item.quantity}</td>
                    <td className="py-1 text-right font-bold">{(item.price * item.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="text-[11px] space-y-1 mb-3 font-bold">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{currencySymbol} {printSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {printIsDineIn && (
                <div className="flex justify-between text-slate-600">
                  <span>Service Charge ({serviceChargePct}%):</span>
                  <span>{currencySymbol} {printServiceCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              {taxPct > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax ({taxPct}%):</span>
                  <span>{currencySymbol} {printTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              {printDiscount > 0 && (() => {
                const discountPct = Math.round((printDiscount / printSubtotal) * 100);
                const isLikelyPercent = discountPct > 0 && Math.abs(printDiscount - ((printSubtotal * discountPct) / 100)) < 0.1;
                return (
                  <div className="flex justify-between text-slate-600">
                    <span>Discount {isLikelyPercent ? `(${discountPct}%)` : ''}:</span>
                    <span>-{currencySymbol} {printDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                );
              })()}

              <div className="flex justify-between text-sm font-black border-t-2 border-black pt-1">
                <span>TOTAL:</span>
                <span>{currencySymbol} {printTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {receiptOrder.payment_method && (
                <div className="flex justify-between text-[10px] font-normal pt-1">
                  <span>Payment:</span>
                  <span>{receiptOrder.payment_method}</span>
                </div>
              )}

              {printMetadata && printMetadata.tendered && (
                <>
                  <div className="flex justify-between text-[10px] font-normal pt-1">
                    <span>Cash Tendered:</span>
                    <span>{currencySymbol} {Number(printMetadata.tendered).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold pt-1">
                    <span>Change:</span>
                    <span>{currencySymbol} {printMetadata.change?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}
            </div>

            <div className="text-center text-[10px] border-t border-dashed border-black pt-2">
              <p className="font-bold">*** THANK YOU COME AGAIN ***</p>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
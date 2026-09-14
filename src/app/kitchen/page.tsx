"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  CheckCircle, RefreshCw, Wifi, WifiOff, Clock, UtensilsCrossed,
  ShoppingBag, Bike, MessageSquare, Trash2, Minus, X, Volume2, VolumeX,
  Flame, ChefHat, Check
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useSettings } from "@/context/SettingsContext";

type OrderItem = {
  id: string;
  name: string;
  price?: number;
  quantity: number;
  is_new?: boolean;
  notes?: string;
  prepared?: boolean;
  added_at?: string;
};

type Order = {
  id: string;
  created_at: string;
  table_no: string;
  items: OrderItem[];
  status: string;
  order_type?: "dine-in" | "takeaway" | "delivery";
  customer_name?: string;
  notes?: string;
  discount?: number;
  total_amount?: number;
};

function ElapsedTime({ startTime }: { startTime: string }) {
  const [mins, setMins] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date().getTime() - new Date(startTime).getTime()) / 60000));
      setMins(diff);
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (mins === 0) {
    return <span className="text-emerald-500 font-extrabold tracking-tight">Just now</span>;
  }

  return (
    <span
      className={`font-black tracking-tight ${mins >= 15 ? "text-rose-500 animate-pulse" : mins >= 10 ? "text-amber-500" : "text-slate-600"
        }`}
    >
      {mins}m ago
    </span>
  );
}

let globalAudioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!globalAudioCtx) {
    globalAudioCtx = new AudioCtx();
  }
  if (globalAudioCtx.state === "suspended") {
    globalAudioCtx.resume();
  }
  return globalAudioCtx;
};

const playChime = (type: "new_order" | "order_ready") => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "new_order") {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === "order_ready") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch (e) {
    console.log("Audio playback prevented by browser auto-play policy", e);
  }
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const { settings } = useSettings();
  const channelRef = useRef<any>(null);

  const [time, setTime] = useState("");
  useEffect(() => {
    const updateTime = () => setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFirstTouch = () => {
      getAudioContext();
      window.removeEventListener("click", handleFirstTouch);
      window.removeEventListener("touchstart", handleFirstTouch);
    };
    window.addEventListener("click", handleFirstTouch, { once: true });
    window.addEventListener("touchstart", handleFirstTouch, { once: true });
    return () => {
      window.removeEventListener("click", handleFirstTouch);
      window.removeEventListener("touchstart", handleFirstTouch);
    };
  }, []);

  useEffect(() => {
    const originalPrint = window.print;
    window.print = () => {
      console.warn("Printing is disabled on the Kitchen screen.");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        console.warn("Print shortcut disabled on Kitchen screen.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.print = originalPrint;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const showToast = (text: string, type: "success" | "error" = "error") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const isKitchenActiveStatus = (status: string) => {
    const s = (status || "").toLowerCase();
    return s === "pending" || s === "preparing";
  };

  const fetchOrders = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    setIsRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["pending", "Pending", "preparing", "Preparing"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase Query Error:", error.message || error);
      } else if (data) {
        setOrders(data as Order[]);
      }
    } catch (err) {
      console.error("Unexpected error in fetchOrders:", err);
    }
    setIsRefreshing(false);
  }, []);

  const setupRealtime = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `kitchen-orders-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as Order;
            if (isKitchenActiveStatus(newOrder.status)) {
              setOrders((prev) => {
                if (prev.some((o) => o.id === newOrder.id)) return prev;
                return [newOrder, ...prev];
              });
              if (soundEnabledRef.current) playChime("new_order");
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Order;
            if (isKitchenActiveStatus(updated.status)) {
              setOrders((prev) => {
                const exists = prev.find((o) => o.id === updated.id);
                const hasNewItems = updated.items?.some((i) => i.is_new);

                if (hasNewItems && soundEnabledRef.current) {
                  playChime("new_order");
                }

                if (exists) {
                  return prev.map((o) => (o.id === updated.id ? updated : o));
                }
                return [updated, ...prev];
              });
            } else {
              setOrders((prev) => prev.filter((o) => o.id !== updated.id));
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            setOrders((prev) => prev.filter((o) => o.id !== deletedId));
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
  }, []);

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

  const markReady = async (id: string) => {
    const orderToUpdate = orders.find((o) => o.id === id);
    setOrders((prev) => prev.filter((o) => o.id !== id));

    const updatePayload: any = { status: "Ready" };
    if (orderToUpdate && orderToUpdate.items) {
      updatePayload.items = orderToUpdate.items.map((i: any) => ({ ...i, prepared: true, is_new: false }));
    }

    const { error } = await supabase.from("orders").update(updatePayload).eq("id", id);
    if (error) {
      showToast("Error marking order ready.");
      fetchOrders();
    }
  };

  const handleUpdateItemQuantity = async (orderId: string, itemIndex: number, delta: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const newItems = [...(order.items || [])];
    const targetItem = newItems[itemIndex];
    if (!targetItem) return;

    if (delta === 0) {
      newItems.splice(itemIndex, 1);
    } else {
      if (targetItem.quantity + delta <= 0) {
        newItems.splice(itemIndex, 1);
      } else {
        newItems[itemIndex] = { ...targetItem, quantity: targetItem.quantity + delta };
      }
    }

    if (newItems.length === 0) {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) {
        showToast("Error deleting empty order.");
        fetchOrders();
      }
      return;
    }

    const hasValidPrices = newItems.every((i) => typeof i.price === "number" && !isNaN(i.price));
    let grandTotal = Number(order.total_amount || 0);

    if (hasValidPrices) {
      const subtotal = newItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
      const discount = Number(order.discount || 0);
      const discounted = Math.max(0, subtotal - discount);
      const isDineIn = !order.order_type || order.order_type === "dine-in";
      const sChargePct = Number(settings?.service_charge_pct ?? 10);
      const tPct = Number(settings?.tax_pct ?? 0);
      const sCharge = isDineIn ? (discounted * sChargePct) / 100 : 0;
      const tax = (discounted * tPct) / 100;
      grandTotal = discounted + sCharge + tax;
    }

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, items: newItems, total_amount: grandTotal } : o)));

    const { error } = await supabase.from("orders").update({
      items: newItems,
      total_amount: grandTotal,
    }).eq("id", orderId);

    if (error) {
      showToast("Error updating item quantity.");
      fetchOrders();
    }
  };

  const handleToggleItemPrepared = async (orderId: string, itemIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const newItems = [...(order.items || [])];
    const targetItem = newItems[itemIndex];
    if (!targetItem) return;

    newItems[itemIndex] = { ...targetItem, prepared: !targetItem.prepared };

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, items: newItems } : o)));

    const { error } = await supabase.from("orders").update({
      items: newItems,
    }).eq("id", orderId);

    if (error) {
      showToast("Error updating item state.");
      fetchOrders();
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex-1 flex flex-col font-sans bg-slate-100 min-h-screen pt-[72px] print:hidden">
        <style dangerouslySetInnerHTML={{ __html: `@media print { body, html { display: none !important; } }` }} />
        <Navbar />

        {toastMessage && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 flex items-center gap-2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm bg-slate-900 text-white">
            {toastMessage.type === "success" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />}
            {toastMessage.text}
          </div>
        )}

        <main className="flex-1 w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-5 flex flex-col gap-4 sm:gap-6 overflow-x-hidden">
          {/* Header Bar - Responsive Compact Grid on Mobile */}
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-14 sm:h-14 bg-orange-50 text-orange-500 rounded-xl sm:rounded-2xl flex items-center justify-center border border-orange-100 shadow-inner shrink-0">
                <ChefHat className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">Kitchen Display</h1>
                  <span className="bg-slate-900 text-white text-[10px] sm:text-[11px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">
                    Live
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs mt-1">
                  <span className="flex items-center gap-1 font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                    <Clock className="w-3 h-3 text-slate-500" /> {time}
                  </span>
                  {isConnected ? (
                    <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sync
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-bold text-rose-600 bg-rose-50 border border-rose-200/70 px-2 py-0.5 rounded-md animate-pulse">
                      <WifiOff className="w-3 h-3" /> Reconnecting
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  if (next) getAudioContext();
                }}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-sm ${soundEnabled
                  ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  : "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100"
                  }`}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-rose-500" />}
                {soundEnabled ? "Sound ON" : "Muted"}
              </button>

              <button
                type="button"
                onClick={fetchOrders}
                disabled={isRefreshing}
                className="p-2 sm:p-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition-all disabled:opacity-50 border border-slate-200 shadow-sm active:scale-95 shrink-0"
                title="Refresh orders"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-orange-500" : ""}`} />
              </button>

              <div className="bg-orange-500 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-md shadow-orange-500/20 whitespace-nowrap text-center">
                {orders.length} Tickets
              </div>
            </div>
          </div>

          {/* Orders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {orders.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 sm:py-28 bg-white rounded-2xl sm:rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 shadow-sm px-4 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3 sm:mb-4 border border-emerald-100">
                  <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-700">Kitchen is all clear!</h2>
                <p className="mt-1 text-slate-400 text-xs sm:text-sm font-medium">Waiting for new incoming orders...</p>
              </div>
            ) : (
              orders.map((order) => {
                const hasNewItems = order.items?.some((i) => i.is_new);
                const isDineIn = !order.order_type || order.order_type === "dine-in";
                const totalCount = order.items?.length || 0;
                const preparedCount = order.items?.filter((i) => i.prepared).length || 0;
                const isAllPrepared = totalCount > 0 && preparedCount === totalCount;

                return (
                  <div
                    key={order.id}
                    className={`bg-white rounded-2xl sm:rounded-[1.75rem] overflow-hidden border-2 flex flex-col shadow-sm transition-all duration-200 ${hasNewItems
                      ? "border-orange-500 shadow-xl shadow-orange-500/10 ring-4 ring-orange-500/20"
                      : isAllPrepared
                        ? "border-emerald-400 shadow-emerald-500/10"
                        : "border-slate-200/90 hover:border-slate-300 shadow-sm hover:shadow-md"
                      }`}
                  >
                    {/* Extra items banner */}
                    {hasNewItems && (
                      <div className="bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 text-white text-[10px] sm:text-[11px] font-black py-1 px-3 flex items-center justify-center gap-1.5 tracking-wider uppercase animate-pulse">
                        <Flame className="w-3.5 h-3.5" /> Extra items added
                      </div>
                    )}

                    {/* Ticket Header */}
                    <div
                      className={`px-4 sm:px-5 py-3 sm:py-4 border-b flex justify-between items-center ${hasNewItems
                        ? "bg-orange-50/70 border-orange-100"
                        : isDineIn
                          ? "bg-slate-900 text-white border-slate-800"
                          : "bg-gradient-to-r from-slate-800 to-indigo-950 text-white border-slate-700"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${hasNewItems ? "bg-orange-500 animate-ping" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                            }`}
                        />
                        {isDineIn ? (
                          <span className={`text-lg sm:text-xl font-black tracking-tight ${hasNewItems ? "text-slate-900" : "text-white"}`}>
                            Table {order.table_no?.padStart(2, "0") || "?"}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="p-1 rounded-lg bg-white/15 text-white">
                              {order.order_type === "delivery" ? <Bike className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                            </span>
                            <span className="font-black text-sm sm:text-base uppercase tracking-wider text-white">
                              {order.order_type}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 ${hasNewItems
                            ? "bg-white text-slate-800 border-orange-200"
                            : "bg-white/10 text-white border-white/20 backdrop-blur-sm"
                            }`}
                        >
                          <Clock className="w-3 h-3 opacity-70" />
                          <ElapsedTime startTime={order.created_at} />
                        </span>
                      </div>
                    </div>

                    {/* Sub-header: Customer Name & Progress */}
                    <div className="px-4 sm:px-5 py-2 sm:py-2.5 bg-slate-50 border-b border-slate-100 flex justify-between items-center text-xs font-bold text-slate-600">
                      <span className="truncate max-w-[140px]" title={order.customer_name || "Guest"}>
                        👤 {order.customer_name || "Dine-in Guest"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-black ${isAllPrepared
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-700"
                          }`}
                      >
                        {preparedCount}/{totalCount} Done
                      </span>
                    </div>

                    {/* Ticket Items List */}
                    <div className="p-3 sm:p-4 flex-1 overflow-y-auto space-y-2 sm:space-y-2.5 min-h-[140px] max-h-[360px] bg-slate-50/40">
                      {order.items?.map((item, idx) => {
                        const isLarge = item.name.toLowerCase().includes("(large)");
                        const isRegular = item.name.toLowerCase().includes("(regular)");
                        const cleanName = item.name.replace(/\s*\((Regular|Large)\)\s*/gi, "").trim();

                        return (
                          <div
                            key={idx}
                            onClick={(e) => handleToggleItemPrepared(order.id, idx, e)}
                            className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border transition-all cursor-pointer select-none relative group ${item.prepared
                              ? "bg-slate-100/90 border-slate-200 text-slate-400 opacity-60"
                              : item.is_new
                                ? "bg-orange-50/90 border-orange-300 text-slate-900 shadow-sm"
                                : "bg-white border-slate-200/90 hover:border-orange-300 text-slate-900 shadow-sm"
                              }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
                                {/* Checkbox / Prepared Toggle */}
                                <div
                                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg border-2 flex items-center justify-center mt-0.5 shrink-0 transition-all ${item.prepared
                                    ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                                    : "bg-white border-slate-300 text-transparent group-hover:border-emerald-400"
                                    }`}
                                >
                                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3.5]" />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-1.5 flex-wrap">
                                    <span
                                      className={`text-sm sm:text-base font-black px-1.5 py-0.5 rounded leading-none ${item.prepared
                                        ? "bg-slate-200 text-slate-500"
                                        : item.is_new
                                          ? "bg-orange-500 text-white"
                                          : "bg-slate-900 text-white"
                                        }`}
                                    >
                                      {item.quantity}x
                                    </span>
                                    <span
                                      className={`font-bold text-xs sm:text-base leading-snug break-words ${item.prepared ? "line-through text-slate-400" : "text-slate-900"
                                        }`}
                                    >
                                      {cleanName}
                                    </span>
                                  </div>

                                  {/* Size indicator pills */}
                                  <div className="flex items-center gap-1.5 mt-1">
                                    {isLarge && (
                                      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                                        Large
                                      </span>
                                    )}
                                    {isRegular && (
                                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                        Regular
                                      </span>
                                    )}
                                    {item.is_new && !item.prepared && (
                                      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500 text-white animate-pulse">
                                        New Cook
                                      </span>
                                    )}
                                  </div>

                                  {/* Item specific notes */}
                                  {item.notes && item.notes.trim() !== "" && (
                                    <div className="mt-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg flex items-start gap-1">
                                      <span className="text-amber-600">⚠️</span>
                                      <span>{item.notes}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Quick Adjust */}
                              {!item.prepared && (
                                <div
                                  className="flex items-center gap-0.5 sm:gap-1 shrink-0 opacity-80 group-hover:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(order.id, idx, -1)}
                                    className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors active:scale-95"
                                    title="Decrease Qty"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(order.id, idx, 0)}
                                    className="p-1 sm:p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors active:scale-95"
                                    title="Remove Item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* General Kitchen Notes */}
                      {order.notes && (
                        <div className="mt-2.5 p-2.5 sm:p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs font-bold flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                          <div>
                            <span className="block text-[10px] uppercase text-amber-600 font-black tracking-wider">
                              Order Note:
                            </span>
                            <p className="font-semibold text-xs leading-relaxed text-amber-950 mt-0.5">{order.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="p-3 sm:p-3.5 border-t border-slate-100 bg-white">
                      <button
                        type="button"
                        onClick={() => markReady(order.id)}
                        className={`w-full py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all flex justify-center items-center gap-2 shadow-sm active:scale-95 ${isAllPrepared
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                          }`}
                      >
                        <CheckCircle className="w-4 h-4 stroke-[2.5]" />
                        {isAllPrepared ? "Ready to Serve (All Done)" : "Mark Order Ready"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
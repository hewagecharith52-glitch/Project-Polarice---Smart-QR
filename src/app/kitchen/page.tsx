"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { CheckCircle, RefreshCw, Wifi, WifiOff, Clock, UtensilsCrossed, ShoppingBag, Bike, MessageSquare, Trash2, Minus, X, Volume2, VolumeX } from "lucide-react";
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
      setMins(Math.floor((new Date().getTime() - new Date(startTime).getTime()) / 60000));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [startTime]);
  return <span className={mins >= 15 ? "text-red-500 font-bold" : "text-slate-500 font-bold"}>{mins}m</span>;
}

// Global AudioContext cache to bypass browser autoplay restrictions after first tap
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

const playChime = (type: 'new_order' | 'order_ready') => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

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
    const updateTime = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Unlock AudioContext on first page interaction
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

  // Safe window.print overriding that restores completely on unmount
  useEffect(() => {
    const originalPrint = window.print;
    window.print = () => {
      console.warn("Printing is disabled on the Kitchen screen.");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        console.warn("Print shortcut disabled on Kitchen screen.");
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.print = originalPrint;
      window.removeEventListener('keydown', handleKeyDown);
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
              if (soundEnabledRef.current) playChime('new_order');
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Order;
            if (isKitchenActiveStatus(updated.status)) {
              setOrders((prev) => {
                const exists = prev.find((o) => o.id === updated.id);
                const hasNewItems = updated.items?.some((i) => i.is_new);

                if (hasNewItems && soundEnabledRef.current) {
                  playChime('new_order');
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
    const orderToUpdate = orders.find(o => o.id === id);
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
    const order = orders.find(o => o.id === orderId);
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
      setOrders(prev => prev.filter(o => o.id !== orderId));
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) {
        showToast("Error deleting empty order.");
        fetchOrders();
      }
      return;
    }

    // Safely recalculate subtotal preserving price fallbacks
    const hasValidPrices = newItems.every(i => typeof i.price === "number" && !isNaN(i.price));
    let grandTotal = Number(order.total_amount || 0);

    if (hasValidPrices) {
      const subtotal = newItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
      const discount = Number(order.discount || 0);
      const discounted = Math.max(0, subtotal - discount);
      const isDineIn = !order.order_type || order.order_type === 'dine-in';
      const sChargePct = Number(settings?.service_charge_pct ?? 10);
      const tPct = Number(settings?.tax_pct ?? 0);
      const sCharge = isDineIn ? (discounted * sChargePct) / 100 : 0;
      const tax = (discounted * tPct) / 100;
      grandTotal = discounted + sCharge + tax;
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: newItems, total_amount: grandTotal } : o));

    const { error } = await supabase.from("orders").update({
      items: newItems,
      total_amount: grandTotal
    }).eq("id", orderId);

    if (error) {
      showToast("Error updating item quantity.");
      fetchOrders();
    }
  };

  const handleToggleItemPrepared = async (orderId: string, itemIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const newItems = [...(order.items || [])];
    const targetItem = newItems[itemIndex];
    if (!targetItem) return;

    newItems[itemIndex] = { ...targetItem, prepared: !targetItem.prepared };

    // Optimistic UI update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: newItems } : o));

    const { error } = await supabase.from("orders").update({
      items: newItems
    }).eq("id", orderId);

    if (error) {
      showToast("Error updating item state.");
      fetchOrders();
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex-1 flex flex-col font-sans bg-slate-50 min-h-screen pt-[72px] print:hidden">
        <style dangerouslySetInnerHTML={{ __html: `@media print { body, html { display: none !important; } }` }} />
        <Navbar />

        {toastMessage && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 flex items-center gap-2 px-6 py-3 rounded-full shadow-xl font-bold text-sm bg-slate-900 text-white">
            {toastMessage.type === "success" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />}
            {toastMessage.text}
          </div>
        )}

        <main className="flex-1 w-full px-3 sm:px-6 py-4 flex flex-col gap-6 overflow-x-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-inner">
                <UtensilsCrossed className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-wide">Kitchen Display System</h1>
                <div className="flex items-center gap-3 text-sm mt-1.5">
                  <span className="flex items-center gap-1.5 text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                    <Clock className="w-4 h-4" /> {time}
                  </span>
                  {isConnected ? (
                    <span className="flex items-center gap-1.5 text-emerald-500 font-bold bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                      <Wifi className="w-4 h-4" /> Live Sync
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-red-500 font-bold animate-pulse bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                      <WifiOff className="w-4 h-4" /> Reconnecting
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  if (next) getAudioContext();
                }}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border transition-colors shadow-sm ${soundEnabled
                  ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                  }`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-rose-500" />}
                {soundEnabled ? "Sound Active" : "Sound Muted"}
              </button>
              <button
                onClick={fetchOrders}
                disabled={isRefreshing}
                className="p-3 bg-white hover:bg-slate-50 text-indigo-600 rounded-xl transition-colors disabled:opacity-50 border border-slate-200 shadow-sm"
                title="Refresh orders"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
              <div className="bg-orange-500 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md shadow-orange-500/20">
                {orders.length} Active Tickets
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {orders.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-32 bg-white/50 rounded-2xl border-2 border-slate-200 border-dashed text-slate-400 shadow-sm">
                <CheckCircle className="w-16 h-16 mb-4 text-emerald-400 opacity-50" />
                <h2 className="text-xl font-bold text-slate-600 tracking-wide">All caught up!</h2>
                <p className="mt-1 text-slate-500 text-sm font-medium">Waiting for new orders from Cashier or Customers...</p>
              </div>
            ) : (
              orders.map((order) => {
                const hasNewItems = order.items?.some((i) => i.is_new);
                const isDineIn = !order.order_type || order.order_type === "dine-in";

                return (
                  <div
                    key={order.id}
                    className={`bg-white rounded-2xl overflow-hidden border flex flex-col shadow-sm hover:shadow-md transition-shadow relative ${hasNewItems ? "border-orange-500 shadow-orange-500/20 ring-2 ring-orange-500/50" : "border-slate-100"
                      }`}
                  >
                    {hasNewItems && (
                      <div className="absolute top-0 left-0 w-full bg-orange-500 text-white text-xs font-bold py-1 text-center animate-pulse tracking-widest z-10">
                        ⚡ EXTRA ITEMS ADDED
                      </div>
                    )}
                    <div
                      className={`p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r ${hasNewItems
                        ? "from-orange-500 to-orange-600 pt-7"
                        : !isDineIn
                          ? "from-amber-600 to-orange-600"
                          : "from-indigo-500 to-indigo-600"
                        }`}
                    >
                      <div className="flex items-center gap-2 text-white">
                        <span className="w-3 h-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] animate-pulse" />
                        {isDineIn ? (
                          <span className="font-bold text-xl tracking-wide">Table {order.table_no?.padStart(2, "0") || "?"}</span>
                        ) : (
                          <span className="font-bold text-base tracking-wide flex items-center gap-1.5 uppercase">
                            {order.order_type === "delivery" ? <Bike className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                            {order.order_type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/30 text-white shadow-sm">
                        <Clock className="w-4 h-4" />
                        <span className="text-white">
                          <ElapsedTime startTime={order.created_at} />
                        </span>
                      </div>
                    </div>

                    {order.customer_name && (
                      <div className="px-5 py-2 bg-slate-100/70 border-b border-slate-200/60 text-xs font-bold text-slate-700 flex justify-between items-center">
                        <span>Customer:</span>
                        <span className="text-slate-900 truncate">{order.customer_name}</span>
                      </div>
                    )}

                    <div className="p-6 flex-1 overflow-y-auto">
                      <ul className="space-y-4">
                        {order.items?.map((item, idx) => (
                          <li
                            key={idx}
                            className={`flex flex-col text-slate-700 p-3 rounded-xl transition-colors ${item.prepared ? "opacity-60 bg-slate-100" : item.is_new ? "bg-orange-50 border border-orange-200" : "bg-white border border-slate-200"
                              }`}
                          >
                            <div className="flex justify-between items-center w-full">
                              <div className="flex items-start sm:items-center gap-3">
                                <button
                                  onClick={(e) => handleToggleItemPrepared(order.id, idx, e)}
                                  className={`shrink-0 mt-0.5 sm:mt-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${item.prepared ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-white border-slate-300 text-transparent hover:border-emerald-400 hover:text-emerald-100'}`}
                                >
                                  <CheckCircle className="w-5 h-5" strokeWidth={3} />
                                </button>
                                <span className={`font-bold text-lg leading-tight pt-0.5 ${item.prepared ? "line-through text-slate-500" : "text-slate-800"}`}>
                                  <span
                                    className={`mr-3 px-2.5 py-0.5 rounded-lg border shadow-sm ${item.prepared
                                      ? "text-slate-500 bg-slate-200 border-slate-300"
                                      : item.is_new
                                        ? "text-orange-600 bg-orange-100 border-orange-200"
                                        : "text-indigo-600 bg-indigo-50 border-indigo-100"
                                      }`}
                                  >
                                    {item.quantity}x
                                  </span>
                                  {item.name}
                                </span>
                              </div>
                              <div className="flex items-center">
                                {item.prepared ? (
                                  <span className="ml-2 inline-block px-2 py-0.5 bg-slate-200 text-slate-500 text-[10px] font-bold rounded-md uppercase tracking-wider">
                                    ✅ Served
                                  </span>
                                ) : item.is_new || item.prepared === false ? (
                                  <span className="ml-2 inline-block px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-md uppercase tracking-wider animate-pulse shadow-sm shadow-orange-500/30">
                                    🔥 Cook
                                  </span>
                                ) : null}
                                {!item.prepared && (
                                  <div className="flex items-center gap-1.5 ml-3">
                                    <button onClick={() => handleUpdateItemQuantity(order.id, idx, -1)} className="p-1 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors" title="Decrease Quantity"><Minus className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleUpdateItemQuantity(order.id, idx, 0)} className="p-1 text-rose-400 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors" title="Remove Item"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {item.notes && item.notes.trim() !== "" && (
                              <div className="mt-2 flex items-start gap-1.5 text-xs font-bold text-amber-900 bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-lg ml-[3.25rem]">
                                <span>⚠️ Note:</span>
                                <span>{item.notes}</span>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>

                      {order.notes && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-bold flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                          <div>
                            <span className="block text-[10px] uppercase text-amber-600 font-bold tracking-wider">Kitchen Note:</span>
                            <p className="font-semibold text-xs leading-relaxed">{order.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => markReady(order.id)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2 shadow-sm active:scale-95"
                      >
                        <CheckCircle className="w-5 h-5" /> Mark Ready
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
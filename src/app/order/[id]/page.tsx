"use client";

import { useEffect, useState, useRef, use } from "react";
import { supabase } from "@/lib/supabase";
import { restaurantConfig } from "@/config/restaurant.config";
import { Clock, ChefHat, CheckCircle, Store, BellRing, MapPin, UtensilsCrossed, Wifi, WifiOff, Gamepad2, ChevronDown, ChevronUp } from "lucide-react";
import confetti from "canvas-confetti";
import Link from "next/link";
import BrickBreaker from "@/components/BrickBreaker";
import { useSettings } from "@/context/SettingsContext";

type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  price?: number;
  notes?: string;
};

type Order = {
  id: string;
  created_at: string;
  status: "Pending" | "Preparing" | "Ready" | "Completed";
  items: OrderItem[];
  table_no: string;
  order_type: string;
  total_amount?: number;
};

let sharedAudioCtx: AudioContext | null = null;
const getSharedAudioCtx = () => {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => { });
    }
    return sharedAudioCtx;
  } catch (e) {
    return null;
  }
};

const playReadyAlert = () => {
  try {
    const ctx = getSharedAudioCtx();
    if (!ctx) return;

    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

      gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration);
    };

    playNote(523.25, 0, 0.4); // C5
    playNote(659.25, 0.15, 0.4); // E5
    playNote(783.99, 0.3, 0.6); // G5
  } catch (err) {
    console.error("Audio API not supported or blocked", err);
  }

  if (typeof navigator !== "undefined" && navigator.vibrate && navigator.userActivation?.hasBeenActive) {
    try {
      navigator.vibrate([200, 100, 200, 100, 400]);
    } catch (e) {
      // Quietly catch intervention error
    }
  }
};

export default function OrderTracking({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const orderId = unwrappedParams.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(15);
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [hasTriggeredAlert, setHasTriggeredAlert] = useState(false);
  const [hasTriggeredCompletedAlert, setHasTriggeredCompletedAlert] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showGame, setShowGame] = useState(true);

  const channelRef = useRef<any>(null);

  const { settings } = useSettings();
  const taxPct = Number(settings?.tax_pct ?? 0);
  const serviceChargePct = Number(settings?.service_charge_pct ?? 10);
  const currencySymbol = settings?.currency || restaurantConfig.currency || 'LKR';

  // Lock body scroll when modals are visible
  const isAnyModalOpen = Boolean(showReadyModal || showCompletedModal);
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

  const calculatePrepTime = async (items: OrderItem[]) => {
    try {
      const { data: dbMenuItems } = await supabase.from('menu_items').select('*');
      const menuSource = dbMenuItems && dbMenuItems.length > 0 ? dbMenuItems : restaurantConfig.menu;
      const maxPrep = items.reduce((max: number, item: OrderItem) => {
        const menuItem = menuSource.find((m: any) => m.id === item.id);
        return Math.max(max, menuItem?.prep_time_minutes || 10);
      }, 10);
      setPrepTimeMinutes(maxPrep);
    } catch (e) {
      setPrepTimeMinutes(15);
    }
  };

  const fetchOrder = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (error) throw error;

      setOrder(data);

      if (data && data.items) {
        calculatePrepTime(data.items);
      }

      if (data.status?.toLowerCase() === "ready" && !hasTriggeredAlert) {
        triggerReadyEffects();
      }

      if (data.status?.toLowerCase() === "completed" && !hasTriggeredCompletedAlert) {
        triggerCompletedEffects();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerReadyEffects = () => {
    if (hasTriggeredAlert) return;
    setHasTriggeredAlert(true);
    setShowReadyModal(true);
    playReadyAlert();
    confetti({
      particleCount: 200,
      spread: 160,
      origin: { y: 0.5 },
      colors: ['#f97316', '#10b981', '#ffffff']
    });
  };

  const triggerCompletedEffects = () => {
    if (hasTriggeredCompletedAlert) return;
    setHasTriggeredCompletedAlert(true);
    setShowCompletedModal(true);
    playReadyAlert();
    confetti({
      particleCount: 300,
      spread: 200,
      origin: { y: 0.5 },
      colors: ['#10b981', '#34d399', '#ffffff']
    });
  };

  useEffect(() => {
    const unlockAudio = () => { getSharedAudioCtx(); };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  useEffect(() => {
    fetchOrder();

    const channel = supabase
      .channel(`order_tracking_${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updatedOrder = payload.new as Order;
          setOrder(updatedOrder);

          if (updatedOrder && updatedOrder.items) {
            calculatePrepTime(updatedOrder.items);
          }

          if (updatedOrder.status?.toLowerCase() === "ready" && !hasTriggeredAlert) {
            triggerReadyEffects();
          }

          if (updatedOrder.status?.toLowerCase() === "completed" && !hasTriggeredCompletedAlert) {
            triggerCompletedEffects();
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, hasTriggeredAlert, hasTriggeredCompletedAlert]);

  // Countdown timer effect
  useEffect(() => {
    const status = order?.status?.toLowerCase();
    if (!order || status === "ready" || status === "completed") {
      setTimeLeftStr("");
      return;
    }

    const targetTime = new Date(order.created_at).getTime() + (prepTimeMinutes * 60000);

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeftStr("Almost there...");
        return;
      }

      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeftStr(`${m}m ${s.toString().padStart(2, '0')}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order, prepTimeMinutes]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-orange-500 animate-spin"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans p-6">
        <div className="bg-white p-8 rounded-3xl shadow-md border border-slate-100 text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Order Not Found</h2>
          <p className="text-slate-500 text-sm mb-6">We couldn't locate your order details.</p>
          <Link href="/menu" className="block w-full bg-slate-900 text-white font-bold py-3 rounded-xl">Return to Menu</Link>
        </div>
      </div>
    );
  }

  const normalizedStatus = (order.status || "").toLowerCase();
  const steps = ["pending", "preparing", "ready", "completed"];
  const currentStepIdx = steps.indexOf(normalizedStatus);

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20 selection:bg-orange-500/30">
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes steamRise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          50% { opacity: 0.6; }
          100% { transform: translateY(-10px) scale(1.2); opacity: 0; }
        }
        .animate-steam {
          animation: steamRise 1.5s infinite ease-in-out;
        }
        @keyframes cookWobble {
          0%, 100% { transform: rotate(-8deg) translateY(0); }
          50% { transform: rotate(8deg) translateY(-2px); }
        }
        .animate-cookWobble {
          animation: cookWobble 1.2s ease-in-out infinite;
        }
        @keyframes ring {
          0%, 100% { transform: rotate(0); }
          20%, 60% { transform: rotate(15deg); }
          40%, 80% { transform: rotate(-15deg); }
        }
        .animate-ring {
          animation: ring 1s ease-in-out infinite;
        }
        @keyframes pop {
          0% { transform: scale(0); }
          80% { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        .animate-pop {
          animation: pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        @keyframes sparkle {
          0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
          50% { transform: scale(1) rotate(90deg); opacity: 1; }
        }
        .animate-sparkle {
          animation: sparkle 1.5s ease-in-out infinite;
        }
      `}} />

      <header className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 h-[72px] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-sm shadow-orange-500/20">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-slate-900 font-bold text-base leading-tight">{settings?.name || restaurantConfig.name}</h1>
            <p className="text-[10px] text-orange-500 font-bold uppercase tracking-wider">Smart QR Menu</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
          {isConnected ? (
            <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Live</span></>
          ) : (
            <><WifiOff className="w-3 h-3 text-slate-400" /><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing</span></>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto p-5 pt-24">
        {/* Header Section */}
        <div className="text-center mb-8">
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-2">Live Tracking</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Order #{order.id.slice(0, 5).toUpperCase()}</h1>
        </div>

        {/* Status Card */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-md shadow-slate-200/50 mb-8 relative overflow-hidden">
          {/* Progress Timeline */}
          <div className="relative mb-8 mt-2">
            <div className={`absolute top-1/2 left-4 right-4 h-1 -translate-y-1/2 rounded-full z-0 ${normalizedStatus === "completed" ? "bg-emerald-500" : "bg-slate-100"}`}></div>
            <div
              className={`absolute top-1/2 left-4 h-1 -translate-y-1/2 rounded-full z-0 transition-all duration-700 ease-out ${normalizedStatus === "completed" ? "bg-emerald-500" : "bg-orange-500"}`}
              style={{ width: `calc(${currentStepIdx < 0 ? 0 : (currentStepIdx / (steps.length - 1)) * 100}% - 32px)` }}
            ></div>

            <div className="relative z-10 flex justify-between">
              {steps.map((step, idx) => {
                const isActive = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                let Icon = Store;
                if (idx === 1) Icon = ChefHat;
                if (idx === 2) Icon = BellRing;
                if (idx === 3) Icon = CheckCircle;

                if (normalizedStatus === "completed") {
                  Icon = CheckCircle;
                }

                let iconWrapperClass = `w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 border-2 border-white relative `;
                const isPendingOrPreparing = normalizedStatus === "pending" || normalizedStatus === "preparing";

                if (normalizedStatus === "completed") {
                  iconWrapperClass += `bg-emerald-500 text-white ring-2 ring-emerald-400 animate-pop `;
                } else if (step === "preparing" && isPendingOrPreparing) {
                  iconWrapperClass += `bg-gradient-to-br from-amber-500 to-orange-500 text-white ring-4 ring-orange-400/40 shadow-lg shadow-orange-500/30 animate-pulse `;
                } else if (isActive) {
                  if (isCurrent) {
                    if (step === "ready") {
                      iconWrapperClass += `bg-emerald-500 text-white ring-4 ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.5)] `;
                    } else if (step === "pending") {
                      iconWrapperClass += `bg-amber-500 text-white animate-pulse ring-4 ring-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.3)] `;
                    }
                  } else {
                    iconWrapperClass += `bg-emerald-500 text-white shadow-sm `;
                  }
                } else {
                  iconWrapperClass += `bg-slate-100 text-slate-400 `;
                }

                return (
                  <div key={step} className="flex flex-col items-center gap-2 relative">
                    <div className={iconWrapperClass}>
                      <Icon className={`w-5 h-5 relative z-10 ${normalizedStatus === "completed" ? "animate-pop" :
                        (step === "preparing" && isPendingOrPreparing) ? "animate-cookWobble" :
                          (isCurrent && step === "ready") ? "animate-ring" : ""
                        }`} />

                      {step === "preparing" && isPendingOrPreparing && (
                        <div className="absolute -top-4 flex items-end justify-center gap-1 w-full pointer-events-none">
                          <span className="w-1 h-3 bg-orange-400 rounded-full animate-steam opacity-80"></span>
                          <span className="w-1.5 h-4 bg-amber-400 rounded-full animate-steam opacity-90 [animation-delay:100ms]"></span>
                          <span className="w-1 h-2.5 bg-orange-300 rounded-full animate-steam opacity-70 [animation-delay:200ms]"></span>
                        </div>
                      )}

                      {normalizedStatus === "completed" && (
                        <div className="absolute inset-0 z-0">
                          <div className="absolute -top-2 -left-2 w-1.5 h-1.5 text-emerald-400 animate-sparkle" style={{ animationDelay: '0s' }}>✨</div>
                          <div className="absolute -bottom-1 -right-2 w-2 h-2 text-emerald-300 animate-sparkle" style={{ animationDelay: '0.3s' }}>✨</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">{normalizedStatus === "pending" ? "Order Received" : (normalizedStatus === "preparing" ? "Preparing in Kitchen 🍳" : order.status)}</h2>
            <p className="text-slate-500 text-sm font-medium">
              {normalizedStatus === "pending" && "Sending to kitchen..."}
              {normalizedStatus === "preparing" && "Chef is cooking your delicious meal..."}
              {normalizedStatus === "ready" && "Your order is ready!"}
              {normalizedStatus === "completed" && "Enjoy your meal!"}
            </p>
          </div>

          {/* Countdown / Estimated Time */}
          {(normalizedStatus === "pending" || normalizedStatus === "preparing") && (
            <div className="mt-8 bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Est. Prep Time</p>
                  <p className="text-slate-900 font-bold">{prepTimeMinutes} mins</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Time Left</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{timeLeftStr || "..."}</p>
              </div>
            </div>
          )}
        </div>

        {/* Order Details */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm mb-8">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-500" />
            {order.order_type === 'dine-in' ? `Dine-in (Table ${order.table_no})` : 'Takeaway'}
          </h3>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex flex-col border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                <div className="flex justify-between items-start text-sm font-medium">
                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{item.quantity}x</span>
                    <div className="flex flex-col">
                      <span className="text-slate-700 font-bold">{item.name}</span>
                      {item.notes && <span className="text-xs text-slate-400 italic mt-0.5">Note: {item.notes}</span>}
                    </div>
                  </div>
                  {item.price !== undefined && (
                    <span className="text-slate-900 font-bold shrink-0">{currencySymbol} {(item.price * item.quantity).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
            {(() => {
              const subtotal = order.items.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0);
              const isDineIn = !order.order_type || order.order_type === 'dine-in';
              const serviceCharge = isDineIn ? (subtotal * serviceChargePct) / 100 : 0;
              const tax = (subtotal * taxPct) / 100;

              return (
                <div className="pt-3 border-t border-slate-100 mt-2 space-y-2">
                  <div className="flex justify-between items-center text-slate-500 text-sm font-bold">
                    <span>Subtotal</span>
                    <span>{currencySymbol} {subtotal.toLocaleString()}</span>
                  </div>
                  {serviceCharge > 0 && (
                    <div className="flex justify-between items-center text-slate-500 text-sm font-bold">
                      <span>Service Charge ({serviceChargePct}%)</span>
                      <span>{currencySymbol} {serviceCharge.toLocaleString()}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between items-center text-slate-500 text-sm font-bold">
                      <span>Tax ({taxPct}%)</span>
                      <span>{currencySymbol} {tax.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                    <span className="font-bold text-slate-500 uppercase tracking-widest text-xs mt-1">Grand Total</span>
                    <span className="text-xl font-bold text-slate-900">{currencySymbol} {(order.total_amount ?? (subtotal + serviceCharge + tax)).toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Play While You Wait (Brick Breaker) */}
        <div className="border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-pink-50/70 shadow-md shadow-indigo-100 rounded-3xl p-1 mb-8 overflow-hidden">
          <button
            onClick={() => setShowGame(!showGame)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/50 transition-colors rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-inner">
                <Gamepad2 className="w-5 h-5 animate-bounce" style={{ animationDuration: '1.5s' }} />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-900 leading-tight flex items-center gap-2">
                  Play While You Wait 🎮
                  <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-full animate-pulse shadow-sm shadow-indigo-500/30">🔥 Play & Chill</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Kill the waiting time! Tap to smash bricks 🕹️</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!showGame && <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-100 px-2 py-1 rounded-lg">Tap to Play</span>}
              {showGame ? <ChevronUp className="w-5 h-5 text-indigo-400" /> : <ChevronDown className="w-5 h-5 text-indigo-400" />}
            </div>
          </button>

          {showGame && (
            <div className="p-4 pt-2 animate-in slide-in-from-top-2 duration-300">
              <BrickBreaker />
            </div>
          )}
        </div>

        <Link
          href={`/menu?table=${order.table_no}`}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-slate-900/20"
        >
          <UtensilsCrossed className="w-5 h-5" /> Order More Items
        </Link>
      </main>

      {/* Full Screen Ready Modal */}
      {showReadyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/30 ring-8 ring-orange-50">
              <BellRing className="w-12 h-12 text-white animate-bounce" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Order Ready!</h2>
            <p className="text-slate-500 mb-8 font-medium">
              {order.order_type === 'dine-in'
                ? "Your food is being served to your table now. Enjoy your meal!"
                : "Please proceed to the counter to pick up your delicious food."}
            </p>
            <button
              onClick={() => setShowReadyModal(false)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all active:scale-95"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}

      {/* Full Screen Completed Modal */}
      {showCompletedModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30 ring-8 ring-emerald-50">
              <CheckCircle className="w-12 h-12 text-white animate-bounce" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Payment Received! 🎉</h2>
            <p className="text-slate-500 mb-8 font-medium">
              Thank you for dining with us. Hope you enjoyed your meal!
            </p>
            <button
              onClick={() => setShowCompletedModal(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-emerald-500/30"
            >
              View Receipt Summary
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
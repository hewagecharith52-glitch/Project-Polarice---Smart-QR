"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MenuItem } from "@/config/restaurant.config";

import {
  Search, ShoppingBag, Plus, Minus, Clock, Flame, Leaf, ChefHat,
  CheckCircle, UtensilsCrossed, X, Star, AlertCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  is_new?: boolean;
  notes?: string;
  cartItemId: string;
};

const tagConfig: Record<string, { icon: any; color: string; bg: string }> = {
  Spicy: { icon: Flame, color: "text-red-500", bg: "bg-red-50 border-red-100" },
  Veg: { icon: Leaf, color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-100" },
  Popular: { icon: ChefHat, color: "text-orange-500", bg: "bg-orange-50 border-orange-100" },
};

function MenuContent() {
  const searchParams = useSearchParams();
  const urlTableNumber = searchParams.get("table");

  const [tableNumber, setTableNumber] = useState(urlTableNumber || "1");
  const [isTableSelectorOpen, setIsTableSelectorOpen] = useState(false);

  useEffect(() => {
    if (urlTableNumber) {
      setTableNumber(urlTableNumber);
      localStorage.setItem("active_table", urlTableNumber);
    } else {
      const savedTable = localStorage.getItem("active_table");
      if (savedTable) {
        setTableNumber(savedTable);
      }
    }
  }, [urlTableNumber]);

  const { isAuthenticated } = useAuth();
  const { settings } = useSettings();

  const availableTables = settings?.tables && settings.tables.length > 0
    ? settings.tables
    : Array.from({ length: settings?.table_count || 20 }, (_, i) => ({
      id: String(i + 1),
      name: `Table ${String(i + 1).padStart(2, "0")}`
    }));

  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cookingNotes, setCookingNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [ticketNumber, setTicketNumber] = useState("");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [itemNotes, setItemNotes] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);

  // Review / Feedback Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [foodRating, setFoodRating] = useState(5);
  const [serviceRating, setServiceRating] = useState(5);
  const [waiterName, setWaiterName] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [uiToast, setUiToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Lock background scroll when any modal or cart drawer is open
  const isAnyModalOpen = Boolean(isCartOpen || isReviewModalOpen || isTableSelectorOpen || selectedMenuItem);
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

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setUiToast({ text, type });
    setTimeout(() => setUiToast(null), 4000);
  };

  const [dbMenu, setDbMenu] = useState<MenuItem[]>([]);

  // Optimized Cache-First Data Fetching
  useEffect(() => {
    let isMounted = true;

    const cachedMenu = typeof window !== "undefined" ? sessionStorage.getItem("cached_menu_data") : null;
    if (cachedMenu) {
      try {
        setDbMenu(JSON.parse(cachedMenu));
      } catch (e) { }
    }

    const fetchMenu = async () => {
      try {
        const { data } = await supabase
          .from("menu_items")
          .select("id, name, price, description, image_url, category, tags, prep_time_minutes")
          .eq("is_available", true)
          .order("category")
          .order("name");

        if (isMounted && data) {
          setDbMenu(data as MenuItem[]);
          sessionStorage.setItem("cached_menu_data", JSON.stringify(data));
        }
      } catch (err) {
        if (isMounted && !cachedMenu) setDbMenu([]);
      }
    };

    fetchMenu();

    const channel = supabase
      .channel("public:menu_items:menu_opt")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => {
        fetchMenu();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const categories = useMemo(() => {
    const items = Array.isArray(dbMenu) ? dbMenu : [];
    const cats = Array.from(new Set(items.map((item: any) => item.category).filter(Boolean)));
    return ["All", ...cats];
  }, [dbMenu]);

  const filteredMenu = useMemo(() => {
    const items = Array.isArray(dbMenu) ? dbMenu : [];
    const cleanSearch = searchQuery.trim().toLowerCase();
    return items.filter((item: any) => {
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      const matchesSearch = !cleanSearch ||
        item.name?.toLowerCase().includes(cleanSearch) ||
        item.description?.toLowerCase().includes(cleanSearch);
      return matchesCategory && matchesSearch;
    });
  }, [dbMenu, activeCategory, searchQuery]);

  const cartQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) {
      map[item.id] = (map[item.id] || 0) + item.quantity;
    }
    return map;
  }, [cart]);

  const getQuantity = (id: string) => cartQuantityMap[id] || 0;

  const updateCartById = (id: string, name: string, price: number, delta: number, notes: string = "") => {
    const cartItemId = `${id}-${notes}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.cartItemId === cartItemId);
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) return prev.filter((i) => i.cartItemId !== cartItemId);
        return prev.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: newQty } : i));
      }
      if (delta > 0) {
        return [...prev, { id, name, price, quantity: delta, notes, cartItemId }];
      }
      return prev;
    });
  };

  const addToCartFromModal = () => {
    if (!selectedMenuItem) return;
    updateCartById(selectedMenuItem.id, selectedMenuItem.name, selectedMenuItem.price, itemQuantity, itemNotes);
    setSelectedMenuItem(null);
    setItemNotes("");
    setItemQuantity(1);
  };

  const taxPct = Number(settings?.tax_pct ?? 0);
  const serviceChargePct = Number(settings?.service_charge_pct ?? 10);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const cartTax = (cartTotal * taxPct) / 100;
  const cartServiceCharge = (cartTotal * serviceChargePct) / 100;
  const cartGrandTotal = cartTotal + cartTax + cartServiceCharge;
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const placeOrder = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    const ticket = Math.floor(1000 + Math.random() * 9000).toString();
    setTicketNumber(ticket);

    const cleanedCartItems = cart.map((item) => ({
      id: String(item.id),
      name: String(item.name),
      price: Number(item.price),
      quantity: Number(item.quantity),
      notes: item.notes || ""
    }));

    try {
      const { data: activeOrders, error: fetchError } = await supabase
        .from("orders")
        .select("*")
        .eq("table_no", tableNumber)
        .in("status", ["pending", "Pending", "preparing", "Preparing", "ready", "Ready"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (activeOrders && activeOrders.length > 0) {
        const activeOrder = activeOrders[0];
        const existingItems = (activeOrder.items || []).map((item: any) => ({ ...item, prepared: item.prepared ?? false }));
        const newItems = cleanedCartItems.map((item) => ({
          ...item,
          is_new: true,
          prepared: false,
          added_at: new Date().toISOString()
        }));
        const mergedItems = [...existingItems, ...newItems];

        // Recalculate full order totals consistently
        const mergedSubtotal = mergedItems.reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
        const discount = Number(activeOrder.discount || 0);
        const discounted = Math.max(0, mergedSubtotal - discount);
        const sCharge = (discounted * serviceChargePct) / 100;
        const tax = (discounted * taxPct) / 100;
        const newTotalAmount = discounted + sCharge + tax;

        const combinedNotes = cookingNotes
          ? `${activeOrder.notes ? activeOrder.notes + " | " : ""}${cookingNotes}`
          : activeOrder.notes;

        const { error: updateError } = await supabase
          .from("orders")
          .update({
            items: mergedItems,
            total_amount: Number(newTotalAmount),
            notes: combinedNotes,
            status: "pending",
            updated_at: new Date().toISOString()
          })
          .eq("id", activeOrder.id);

        if (updateError) {
          showToast(`Failed to update order: ${updateError.message}`, "error");
          return;
        }
        setPlacedOrderId(activeOrder.id);
      } else {
        const payload = {
          table_no: tableNumber || "1",
          order_type: "dine-in",
          items: cleanedCartItems,
          total_amount: Number(cartGrandTotal),
          payment_method: "Pending",
          status: "pending",
          notes: cookingNotes || ""
        };

        const { data, error: insertError } = await supabase
          .from("orders")
          .insert([payload])
          .select();

        if (insertError) {
          showToast(`Failed to place order: ${insertError.message}`, "error");
          return;
        }

        if (data && data[0]) {
          setPlacedOrderId(data[0].id);
        }
      }

      setOrderSuccess(true);
      setCart([]);
      setIsCartOpen(false);
      setCookingNotes("");

      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ["#f97316", "#fb923c", "#ffffff", "#10b981"],
      });
    } catch (error: any) {
      console.error("Error placing order:", error);
      showToast("Failed to place order. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReview(true);

    try {
      const payload = {
        table_no: String(tableNumber || "1"),
        food_rating: Number(foodRating),
        service_rating: Number(serviceRating),
        waiter_name: waiterName.trim() || "Staff",
        customer_name: reviewerName.trim() || "Guest",
        comment: reviewComment.trim() || null
      };

      const { error } = await supabase.from("customer_reviews").insert([payload]);

      if (error) {
        showToast("Failed to submit review: " + error.message, "error");
      } else {
        setIsReviewModalOpen(false);
        setReviewComment("");
        setWaiterName("");
        setReviewerName("");
        showToast("Thank you! Your feedback has been received.", "success");
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.7 }
        });
      }
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const renderReviewModal = () => {
    if (!isReviewModalOpen) return null;
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60">
        <div className="bg-white rounded-[2.5rem] w-full max-w-md p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-300">
          <button
            onClick={() => setIsReviewModalOpen(false)}
            className="absolute top-5 right-5 w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-600">
              <Star className="w-7 h-7 fill-amber-500 text-amber-500" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">Rate Your Experience</h3>
            <p className="text-xs text-slate-500 mt-1">Table {tableNumber} • Help us serve you better!</p>
          </div>

          <form onSubmit={handleReviewSubmit} className="space-y-5">
            {/* Food Rating */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">🍲 Food Quality</span>
                <span className="text-xs font-bold text-amber-600">{foodRating} of 5</span>
              </div>
              <div className="flex gap-2 justify-center py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setFoodRating(star)}
                    className="p-1.5 transition-transform hover:scale-125 active:scale-95"
                  >
                    <Star
                      className={`w-8 h-8 ${star <= foodRating ? "fill-amber-400 text-amber-400" : "text-slate-300"
                        }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Service Rating */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">🤵 Waiter & Service</span>
                <span className="text-xs font-bold text-amber-600">{serviceRating} of 5</span>
              </div>
              <div className="flex gap-2 justify-center py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => setServiceRating(star)}
                    className="p-1.5 transition-transform hover:scale-125 active:scale-95"
                  >
                    <Star
                      className={`w-8 h-8 ${star <= serviceRating ? "fill-amber-400 text-amber-400" : "text-slate-300"
                        }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Waiter Name & Customer Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Waiter Name</label>
                <input
                  type="text"
                  value={waiterName}
                  onChange={(e) => setWaiterName(e.target.value)}
                  placeholder="e.g. Kamal"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Your Name</label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="e.g. Kasun"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Comments or Suggestions</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Tell us what you loved or how we can improve..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingReview}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-amber-500/25 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmittingReview ? "Submitting..." : "Submit Review ⭐"}
            </button>
          </form>
        </div>
      </div>
    );
  };

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {isAuthenticated ? (
          <Navbar />
        ) : (
          <header className="fixed top-0 w-full z-50 bg-white border-b border-slate-200 px-4 sm:px-6 h-16 md:h-[72px] flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-sm shadow-orange-500/20 shrink-0">
                <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-slate-900 font-bold text-sm sm:text-base leading-tight truncate">{(settings?.name || 'Smart POS')}</h1>
                <p className="text-[8px] sm:text-[10px] text-orange-500 font-bold uppercase tracking-wider">Smart QR Menu</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 bg-slate-100 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold whitespace-nowrap">
                🍽️ <span className="hidden xs:inline">Table </span>{tableNumber.padStart(2, "0")}
              </div>
            </div>
          </header>
        )}
        <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center mt-12">
          <div className="w-24 h-24 bg-emerald-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-lg shadow-emerald-500/30">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>

          <h2 className="text-3xl font-bold tracking-tight mb-2 text-slate-900">Order Placed!</h2>
          <div className="flex items-center gap-2 text-slate-500 mb-10">
            <span className="text-sm font-medium">Ticket No.</span>
            <span className="text-orange-500 font-mono tracking-wider font-bold text-lg">#{ticketNumber}</span>
          </div>

          <div className="w-full bg-white border border-slate-100 rounded-3xl p-6 mb-8 text-left shadow-md shadow-slate-200/50">
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100">
                <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Kitchen Preparing...</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Your order is being crafted</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                <Clock className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Est. Serving Time</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">12 - 18 minutes</p>
              </div>
            </div>
          </div>

          {placedOrderId && (
            <Link
              href={`/order/${placedOrderId}`}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold tracking-wide transition-colors shadow-lg active:scale-95 mb-3 flex justify-center items-center gap-2"
            >
              <Clock className="w-5 h-5" /> Track Your Order Live
            </Link>
          )}

          <button
            onClick={() => setIsReviewModalOpen(true)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-bold tracking-wide transition-colors shadow-lg active:scale-95 mb-3 flex justify-center items-center gap-2"
          >
            <Star className="w-5 h-5 fill-white" /> Rate Food & Waiter
          </button>

          <button
            onClick={() => {
              setOrderSuccess(false);
              setPlacedOrderId(null);
              setTableNumber(localStorage.getItem("active_table") || tableNumber);
            }}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold tracking-wide transition-colors shadow-lg active:scale-95"
          >
            Order More
          </button>
        </div>

        {renderReviewModal()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pt-16 md:pt-[72px] pb-32 font-sans selection:bg-orange-500/30">
      {isAuthenticated ? (
        <Navbar rightActions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTableSelectorOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 bg-slate-100 hover:bg-slate-200 transition-colors rounded-lg border border-slate-200 text-slate-700 text-xs font-bold whitespace-nowrap"
            >
              🍽️ Table {tableNumber.padStart(2, "0")}
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-slate-600 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors"
            >
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
              {cartCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        } />
      ) : (
        <header className="fixed top-0 w-full z-50 bg-white border-b border-slate-200 px-4 sm:px-6 h-16 md:h-[72px] flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-sm shadow-orange-500/20 shrink-0">
              <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-slate-900 font-bold text-sm sm:text-base leading-tight truncate">{(settings?.name || 'Smart POS')}</h1>
              <p className="text-[8px] sm:text-[10px] text-orange-500 font-bold uppercase tracking-wider">Smart QR Menu</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsTableSelectorOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 bg-slate-100 hover:bg-slate-200 transition-colors rounded-lg border border-slate-200 text-slate-700 text-xs font-bold whitespace-nowrap"
            >
              🍽️ Table {tableNumber.padStart(2, "0")}
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-slate-600 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors"
            >
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
              {cartCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </header>
      )}

      {/* Global Notification Toast */}
      {uiToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-bold text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          {uiToast.type === "success" ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-rose-400" />}
          {uiToast.text}
        </div>
      )}

      {/* Search Bar & Categories */}
      <div className="sticky top-16 md:top-[72px] z-20 bg-slate-50 border-b border-slate-200 shadow-sm pt-3 lg:pt-6">
        <div className="px-5 pb-4">
          <div className="relative group">
            <Search className="w-5 h-5 absolute left-5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
            <input
              type="text"
              placeholder="Search for delicious food..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all outline-none placeholder:text-slate-400 font-bold shadow-sm"
            />
          </div>
        </div>

        {!searchQuery && (
          <div className="flex overflow-x-auto px-5 pb-4 gap-3 no-scrollbar snap-x snap-mandatory scroll-smooth">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 sm:px-6 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-300 shadow-sm snap-start ${activeCategory === cat
                  ? "bg-gradient-to-r from-orange-500 to-orange-400 text-white shadow-orange-500/30 border-transparent"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Menu Grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-4 py-4 sm:py-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 overflow-x-hidden">
        {filteredMenu.map((item) => {
          const qty = getQuantity(item.id);
          return (
            <div
              key={item.id}
              onClick={() => {
                setSelectedMenuItem(item);
                setItemQuantity(1);
                setItemNotes("");
              }}
              className="group bg-white border border-slate-100 rounded-2xl p-3 sm:p-5 flex flex-col gap-2 sm:gap-4 shadow-sm hover:shadow-lg transition-shadow cursor-pointer relative"
            >
              <div className="w-full h-28 sm:h-56 rounded-xl sm:rounded-2xl overflow-hidden relative bg-slate-100 shrink-0">
                <img
                  src={item.image_url && item.image_url.trim() !== "" ? item.image_url : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=70"}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    e.currentTarget.src =
                      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=70";
                  }}
                />
                <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-wrap gap-1 sm:gap-2 pr-2 sm:pr-3 pointer-events-none">
                  {item.prep_time_minutes && (
                    <span className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[10px] uppercase font-bold tracking-widest bg-slate-900/90 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl shadow-sm border border-slate-700">
                      ⏱️ {item.prep_time_minutes}-{item.prep_time_minutes + 5}m
                    </span>
                  )}
                  {item.tags &&
                    item.tags.map((tag) => {
                      const style = tagConfig[tag] || {
                        icon: null,
                        color: "text-slate-600",
                        bg: "bg-white border-slate-200",
                      };
                      const Icon = style.icon;
                      return (
                        <span
                          key={tag}
                          className={`flex items-center gap-1 text-[8px] sm:text-[10px] uppercase font-bold tracking-widest ${style.bg} ${style.color} px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl shadow-sm bg-white border`}
                        >
                          {Icon && <Icon className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />}
                          {tag}
                        </span>
                      );
                    })}
                </div>
              </div>

              <div className="flex flex-col flex-1 px-0.5 sm:px-1 min-w-0">
                <h3 className="font-bold text-xs sm:text-2xl text-slate-900 mb-0.5 sm:mb-1.5 leading-tight line-clamp-1">{item.name}</h3>
                <p className="text-[9px] sm:text-sm text-slate-500 line-clamp-2 leading-relaxed font-medium mb-2 sm:mb-5 hidden sm:block">
                  {item.description}
                </p>

                <div className="mt-auto pt-2 sm:pt-3 border-t border-slate-100 flex flex-row items-center justify-between gap-1.5 sm:gap-2">
                  <div className="flex flex-col min-w-0 shrink">
                    <span className="text-[8px] sm:text-[10px] uppercase font-semibold text-slate-400 hidden sm:block">Price</span>
                    <span className="text-[11px] sm:text-base font-bold text-slate-900 tracking-tight truncate">
                      {(settings?.currency || 'LKR')} {item.price.toLocaleString()}
                    </span>
                  </div>

                  {qty > 0 ? (
                    <div className="flex items-center bg-slate-50 rounded-xl p-0.5 sm:p-1 border border-slate-200 shadow-sm shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateCartById(item.id, item.name, item.price, -1); }}
                        className="w-7 h-7 sm:w-11 sm:h-11 flex items-center justify-center bg-white rounded-lg text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-100 transition-colors active:scale-90 shrink-0"
                      >
                        <Minus className="w-3 h-3 sm:w-5 sm:h-5" />
                      </button>
                      <span className="w-6 sm:w-10 text-center font-bold text-slate-900 text-xs sm:text-base">{qty}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateCartById(item.id, item.name, item.price, 1); }}
                        className="w-7 h-7 sm:w-11 sm:h-11 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 shadow-sm transition-colors active:scale-90 shrink-0"
                      >
                        <Plus className="w-3 h-3 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); updateCartById(item.id, item.name, item.price, 1); }}
                      className="shrink-0 w-7 h-7 sm:w-auto sm:px-5 sm:py-3 rounded-lg sm:rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white font-bold transition-all flex items-center justify-center shadow-sm sm:min-h-[44px]"
                    >
                      <Plus className="w-4 h-4 sm:hidden" />
                      <span className="hidden sm:inline text-sm">+ Add to Order</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredMenu.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm col-span-full">
            <ChefHat className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="font-bold text-xl text-slate-700">No items found</p>
            <p className="text-sm text-slate-500 mt-2 font-medium">Try adjusting your search or category.</p>
          </div>
        )}
      </main>

      {/* Floating Rate & Review Button */}
      <button
        onClick={() => setIsReviewModalOpen(true)}
        className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-40 bg-white text-slate-800 border-2 border-amber-300 hover:border-amber-400 hover:bg-amber-50 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl shadow-xl flex items-center gap-2 sm:gap-2.5 transition-all hover:scale-105 active:scale-95 group font-bold text-xs sm:text-sm"
      >
        <div className="w-7 h-7 rounded-xl bg-amber-400 text-white flex items-center justify-center shadow-sm shrink-0">
          <Star className="w-4 h-4 fill-white text-white" />
        </div>
        <span className="sm:hidden">Rate</span>
        <span className="hidden sm:inline">Rate Food & Service</span>
      </button>

      {/* Floating Checkout Cart Button (Desktop) */}
      {cartCount > 0 && (
        <button
          onClick={() => setIsCartOpen(true)}
          className="hidden md:flex fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-tr from-orange-600 to-orange-400 text-white rounded-[2rem] shadow-[0_10px_30px_rgba(249,115,22,0.4)] items-center justify-center z-40 transition-transform hover:scale-105 active:scale-95 border-2 border-white/20"
        >
          <ShoppingBag className="w-7 h-7" />
          <span className="absolute -top-2 -right-2 bg-slate-900 text-white text-xs w-7 h-7 flex items-center justify-center rounded-full font-bold shadow-md border-2 border-white animate-bounce">
            {cartCount}
          </span>
        </button>
      )}

      {/* Fixed Bottom Bar Cart (Mobile) */}
      {cartCount > 0 && (
        <div className="md:hidden fixed bottom-2 left-3 right-3 z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-slate-900 text-white rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center font-bold text-sm shadow-inner shadow-white/20">
                {cartCount}
              </div>
              <span className="font-bold text-sm">View Cart</span>
            </div>
            <span className="font-bold text-sm">{(settings?.currency || 'LKR')} {cartGrandTotal.toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Slide-over Cart Drawer */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-500 ${isCartOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
      >
        <div className="absolute inset-0 bg-slate-900/40" onClick={() => setIsCartOpen(false)} />
        <div
          className={`absolute bottom-0 left-0 w-full bg-slate-50 rounded-t-[2.5rem] shadow-[0_-10px_50px_rgba(0,0,0,0.1)] transition-transform duration-500 ease-out flex flex-col max-h-[90vh] ${isCartOpen ? "translate-y-0" : "translate-y-full"
            }`}
        >
          <div className="p-6 pb-4 flex justify-between items-center bg-white rounded-t-[2.5rem] border-b border-slate-100">
            <h2 className="text-2xl font-bold text-slate-900">Your Cart</h2>
            <button
              onClick={() => setIsCartOpen(false)}
              className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            {cart.map((item) => (
              <div key={item.cartItemId} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex-1 pr-4">
                  <h4 className="font-bold text-slate-900 text-lg leading-tight">{item.name}</h4>
                  <p className="text-orange-500 font-bold text-sm mt-1">
                    {(settings?.currency || 'LKR')} {(item.price * item.quantity).toLocaleString()}
                  </p>
                  {item.notes && (
                    <p className="text-xs text-slate-500 mt-1 font-medium bg-slate-50 p-1.5 rounded-lg border border-slate-100 italic">
                      Note: {item.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-1 border border-slate-200 shrink-0">
                  <button
                    onClick={() => updateCartById(item.id, item.name, item.price, -1, item.notes)}
                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-slate-700 shadow-sm border border-slate-100 active:scale-90"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-bold text-slate-900">{item.quantity}</span>
                  <button
                    onClick={() => updateCartById(item.id, item.name, item.price, 1, item.notes)}
                    className="w-8 h-8 flex items-center justify-center bg-orange-500 text-white rounded-lg shadow-sm active:scale-90"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">Special Cooking Notes</label>
              <textarea
                value={cookingNotes}
                onChange={(e) => setCookingNotes(e.target.value)}
                placeholder="e.g., Less spicy, extra sauce..."
                className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 outline-none transition-all placeholder:text-slate-400 font-medium shadow-sm"
                rows={3}
              />
            </div>
          </div>

          <div className="p-6 bg-white border-t border-slate-200 pb-8">
            <div className="flex justify-between items-center mb-6">
              <span className="text-slate-500 font-bold">Total Amount</span>
              <span className="text-3xl font-bold text-slate-900">
                <span className="text-slate-400 text-xl mr-1">{(settings?.currency || 'LKR')}</span>
                {cartGrandTotal.toLocaleString()}
              </span>
            </div>
            <button
              onClick={placeOrder}
              disabled={isSubmitting}
              className="w-full py-5 bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500 text-white font-bold rounded-2xl text-xl tracking-wide transition-all shadow-[0_10px_20px_rgba(249,115,22,0.3)] disabled:opacity-70 active:scale-[0.98] flex justify-center"
            >
              {isSubmitting ? (
                <div className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Place Order"
              )}
            </button>
          </div>
        </div>
      </div>

      {renderReviewModal()}

      {/* Table Selector Modal */}
      {isTableSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-6 shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setIsTableSelectorOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-500 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 mb-1">Select Table</h3>
            <p className="text-xs text-slate-500 mb-4">Tap on your table to start ordering.</p>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[360px] overflow-y-auto p-1 no-scrollbar">
              {availableTables.map((table: any) => {
                const isActive = tableNumber === table.id;
                return (
                  <button
                    key={table.id}
                    onClick={() => {
                      setTableNumber(table.id);
                      localStorage.setItem("active_table", table.id);

                      const newUrl = new URL(window.location.href);
                      newUrl.searchParams.set("table", table.id);
                      window.history.pushState({}, "", newUrl);

                      setIsTableSelectorOpen(false);
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${isActive
                      ? "bg-orange-500 text-white shadow-md shadow-orange-500/30 border-orange-500 ring-2 ring-orange-500"
                      : "bg-slate-50 hover:bg-orange-50 hover:border-orange-200 border-slate-200 text-slate-800"
                      }`}
                  >
                    <span className="text-2xl mb-1 drop-shadow-sm">🍽️</span>
                    <span className="text-[10px] sm:text-xs font-bold truncate w-full text-center">{table.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedMenuItem && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60">
          <div className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 flex flex-col max-h-[90vh]">

            <button onClick={() => setSelectedMenuItem(null)} className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors">
              <X className="w-5 h-5" />
            </button>

            <div className="w-full h-48 sm:h-64 relative bg-slate-100 shrink-0">
              <img
                src={selectedMenuItem.image_url && selectedMenuItem.image_url.trim() !== "" ? selectedMenuItem.image_url : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=70"}
                alt={selectedMenuItem.name}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=70"; }}
              />
              <div className="absolute top-4 left-4 flex flex-wrap gap-2 pr-12">
                {selectedMenuItem.prep_time_minutes && (
                  <span className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-widest bg-slate-900/90 text-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-700">
                    ⏱️ {selectedMenuItem.prep_time_minutes}-{selectedMenuItem.prep_time_minutes + 5}m
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 overflow-y-auto no-scrollbar flex flex-col gap-6">
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedMenuItem.tags && selectedMenuItem.tags.map(tag => {
                    const style = tagConfig[tag] || { icon: null, color: "text-slate-600", bg: "bg-slate-100 border-slate-200" };
                    const Icon = style.icon;
                    return (
                      <span key={tag} className={`flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest ${style.bg} ${style.color} px-2.5 py-1 rounded-lg border`}>
                        {Icon && <Icon className="w-3 h-3" />} {tag}
                      </span>
                    );
                  })}
                </div>
                <h3 className="font-bold text-2xl text-slate-900 leading-tight mb-2">{selectedMenuItem.name}</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">{selectedMenuItem.description}</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Special Cooking Notes</label>
                <textarea
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="e.g., Less spicy, no onions..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 outline-none transition-all placeholder:text-slate-400 font-medium"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="font-bold text-slate-700">Quantity</span>
                <div className="flex items-center gap-4 bg-slate-50 rounded-2xl p-1.5 border border-slate-200">
                  <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-100 transition-colors">
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="w-8 text-center font-bold text-lg text-slate-900">{itemQuantity}</span>
                  <button onClick={() => setItemQuantity(itemQuantity + 1)} className="w-10 h-10 flex items-center justify-center bg-orange-500 text-white rounded-xl hover:bg-orange-600 shadow-sm transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <button
                onClick={addToCartFromModal}
                className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white py-4 rounded-2xl font-bold text-lg transition-colors shadow-lg shadow-orange-500/25 mt-2 flex justify-between items-center px-6"
              >
                <span>Add to Order</span>
                <span>{(settings?.currency || 'LKR')} {(selectedMenuItem.price * itemQuantity).toLocaleString()}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold">Loading Menu...</div>}>
      <MenuContent />
    </Suspense>
  );
}
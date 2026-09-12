"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useSettings } from "@/context/SettingsContext";
import {
  UtensilsCrossed, Settings as SettingsIcon, Plus, Check, Search,
  Pencil, Trash2, X, Leaf, Flame, Image as ImageIcon, Lock, Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";

export default function AdminPage() {
  // --- Admin Access Lock States ---
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Check PIN function
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput || isVerifying) return;

    setIsVerifying(true);
    setPinError(false);

    try {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("admin_pin")
        .limit(1)
        .maybeSingle();

      const validPin = data?.admin_pin || "1996";

      if (pinInput === String(validPin)) {
        setIsUnlocked(true);
        setPinInput("");
        setPinError(false);
      } else {
        setPinError(true);
        setPinInput("");
      }
    } catch (err) {
      setPinError(true);
      setPinInput("");
    } finally {
      setIsVerifying(false);
    }
  };

  const { settings: globalSettings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<"menu" | "settings">("menu");

  const [settingsForm, setSettingsForm] = useState({
    name: "",
    tagline: "",
    currency: "LKR",
    service_charge_pct: 0,
    tax_pct: 0,
    phone: "",
    address: "",
  });

  const [isSaving, setIsSaving] = useState(false);

  // --- Toast state ---
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // --- Menu Item State ---
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const DEFAULT_CATEGORIES = ["Starters", "Mains", "Desserts", "Beverages"];
  const categories = ["All", ...Array.from(
    new Set([...DEFAULT_CATEGORIES, ...menuItems.map((i) => i.category).filter(Boolean)])
  )];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const defaultForm = {
    name: "",
    category: "Mains",
    price: 0,
    description: "",
    image_url: "",
    prep_time_minutes: 15,
    is_veg: false,
    is_spicy: false,
    is_popular: false,
    is_available: true,
  };
  const [menuForm, setMenuForm] = useState(defaultForm);

  const fetchMenu = useCallback(async () => {
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .order("category")
      .order("name");
    if (data) setMenuItems(data);
  }, []);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!isUnlocked) return;
    fetchMenu();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`menu_items_changes_${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => {
        fetchMenu();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isUnlocked, fetchMenu]);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (globalSettings) {
      setSettingsForm({
        name: globalSettings.name || "",
        tagline: globalSettings.tagline || "",
        currency: globalSettings.currency || "LKR",
        service_charge_pct: globalSettings.service_charge_pct ?? 0,
        tax_pct: globalSettings.tax_pct ?? 0,
        phone: globalSettings.phone || "",
        address: globalSettings.address || "",
      });
    }
  }, [globalSettings]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const success = await updateSettings(settingsForm);
      if (success) {
        showToast("Configuration saved successfully!");
      } else {
        showToast("Failed to save configuration.", "error");
      }
    } catch (error) {
      console.error("Save error:", error);
      showToast("Failed to save settings.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMenu = async () => {
    if (!menuForm.name || menuForm.price <= 0) {
      showToast("Please provide a valid name and price greater than 0.", "error");
      return;
    }

    setIsSaving(true);
    const payload = {
      ...menuForm,
      image_url: menuForm.image_url || FALLBACK_IMAGE,
    };

    if (editingItem) {
      const { error } = await supabase.from("menu_items").update(payload).eq("id", editingItem.id);
      if (error) showToast("Error updating item: " + error.message, "error");
      else showToast("Item updated successfully!");
    } else {
      const { error } = await supabase.from("menu_items").insert([payload]);
      if (error) showToast("Error creating item: " + error.message, "error");
      else showToast("Item created successfully!");
    }

    setIsSaving(false);
    setIsModalOpen(false);
    setEditingItem(null);
    setMenuForm(defaultForm);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this dish?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) showToast("Failed to delete item.", "error");
    else showToast("Dish deleted.");
  };

  const toggleAvailability = async (id: string, current: boolean) => {
    await supabase.from("menu_items").update({ is_available: !current }).eq("id", id);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setMenuForm({
      name: item.name,
      category: item.category,
      price: item.price,
      description: item.description || "",
      image_url: item.image_url || "",
      prep_time_minutes: item.prep_time_minutes || 15,
      is_veg: item.is_veg || false,
      is_spicy: item.is_spicy || false,
      is_popular: item.is_popular || false,
      is_available: item.is_available ?? true,
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setMenuForm(defaultForm);
    setIsModalOpen(true);
  };

  const filteredMenu = menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <ProtectedRoute>
      {/* ── PIN LOCK OVERLAY (Visible on direct hit, forward, or reload) ── */}
      {!isUnlocked && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full border border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mb-6 shadow-inner border border-orange-100">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Manager Access</h2>
            <p className="text-sm font-medium text-slate-500 mb-6">Enter PIN to access settings.</p>

            <form onSubmit={handleVerifyPin}>
              <div className="mb-6">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                  placeholder="••••"
                  className={`w-full text-center text-3xl tracking-[0.5em] p-4 rounded-xl border font-bold ${pinError ? 'border-rose-300 bg-rose-50 text-rose-700 focus:ring-rose-200' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-orange-500 focus:ring-orange-200'} focus:outline-none focus:ring-4 transition-all`}
                  autoFocus
                />
                {pinError && (
                  <p className="text-xs font-semibold text-rose-600 mt-2 text-center">
                    Incorrect PIN. Please try again.
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={!pinInput || isVerifying}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-[0_8px_20px_rgba(15,23,42,0.2)] active:scale-[0.98]"
              >
                {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Unlock"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-2 px-6 py-3 rounded-full shadow-xl font-bold text-sm animate-in fade-in slide-in-from-top-4 whitespace-nowrap ${toast.type === "error"
            ? "bg-rose-600 text-white"
            : "bg-slate-900 text-white"
            }`}
        >
          {toast.type === "error" ? (
            <X className="w-4 h-4 text-rose-300" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400" />
          )}
          {toast.message}
        </div>
      )}

      <main className="min-h-screen bg-slate-50 flex flex-col pt-[72px]">
        <Navbar />

        <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-6">
          {/* Header & Tabs */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Restaurant Admin</h1>
              <p className="text-slate-500 font-medium text-xs sm:text-sm mt-1">Configure your menu catalog, tables, and global POS settings.</p>
            </div>

            <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-200 w-full sm:w-auto overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab("menu")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === "menu" ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
              >
                <UtensilsCrossed className="w-4 h-4" /> Menu Catalog
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === "settings" ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
              >
                <SettingsIcon className="w-4 h-4" /> General Settings
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 flex flex-col">
            {activeTab === "menu" && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-800">Menu Catalog</h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Manage your dishes, categories, and availability.</p>
                  </div>
                  <button onClick={openAddModal} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add Dish
                  </button>
                </div>

                {/* Filters */}
                <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-4">
                  <div className="flex overflow-x-auto gap-2 pb-1 sm:pb-0 no-scrollbar w-full sm:w-auto">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all shrink-0 ${activeCategory === cat
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full sm:w-64 shrink-0">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search dishes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all w-full"
                    />
                  </div>
                </div>

                <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-slate-50/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {filteredMenu.map((item) => (
                      <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                        <div className="h-36 sm:h-40 bg-slate-100 relative">
                          <img
                            src={item.image_url || FALLBACK_IMAGE}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
                            }}
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            {item.is_veg && <span className="bg-emerald-500 text-white p-1.5 rounded-md shadow-sm" title="Vegetarian"><Leaf className="w-3.5 h-3.5" /></span>}
                            {item.is_spicy && <span className="bg-red-500 text-white p-1.5 rounded-md shadow-sm" title="Spicy"><Flame className="w-3.5 h-3.5" /></span>}
                          </div>
                          {!item.is_available && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                              <span className="bg-slate-900 text-white px-3 py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-widest">Unavailable</span>
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <div className="flex justify-between items-start mb-2 gap-2">
                            <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight pr-1 truncate">{item.name}</h3>
                            <span className="font-bold text-xs sm:text-sm text-orange-600 whitespace-nowrap">{globalSettings?.currency || "LKR"} {item.price.toLocaleString()}</span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 line-clamp-2 mb-4 flex-1">{item.description}</p>
                          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                            <button
                              onClick={() => toggleAvailability(item.id, item.is_available)}
                              className={`text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${item.is_available ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                            >
                              {item.is_available ? "In Stock" : "Sold Out"}
                            </button>
                            <div className="flex gap-1">
                              <button onClick={() => openEditModal(item)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {filteredMenu.length === 0 && (
                    <div className="text-center text-slate-400 py-12">
                      <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium text-base sm:text-lg text-slate-500">No dishes found</p>
                      <p className="text-xs sm:text-sm mt-1">Try adjusting your search or category filters.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col max-w-3xl mx-auto w-full">
                <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5 text-orange-500" /> POS Configuration
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">Update global restaurant settings and preferences.</p>
                </div>
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Restaurant Name</label>
                    <input
                      type="text"
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                      placeholder="e.g. The Grand Aroma"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tagline / Receipt Footer</label>
                      <input
                        type="text"
                        value={settingsForm.tagline}
                        onChange={(e) => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                        placeholder="e.g. Thank you, come again!"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Currency Symbol</label>
                      <input
                        type="text"
                        value={settingsForm.currency}
                        onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                        placeholder="e.g. LKR or $"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Service Charge (%)</label>
                      <input
                        type="number"
                        value={settingsForm.service_charge_pct === 0 ? "" : settingsForm.service_charge_pct}
                        onChange={(e) => setSettingsForm({ ...settingsForm, service_charge_pct: e.target.value === "" ? 0 : Number(e.target.value) })}
                        placeholder="0"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tax (%)</label>
                      <input
                        type="number"
                        value={settingsForm.tax_pct === 0 ? "" : settingsForm.tax_pct}
                        onChange={(e) => setSettingsForm({ ...settingsForm, tax_pct: e.target.value === "" ? 0 : Number(e.target.value) })}
                        placeholder="0"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contact Phone / Hotline</label>
                      <input
                        type="text"
                        value={settingsForm.phone}
                        onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                        placeholder="+94 77 123 4567"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Address</label>
                      <input
                        type="text"
                        value={settingsForm.address}
                        onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                        placeholder="123 Main Street"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className="mt-6 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 sm:py-4 rounded-xl shadow-md transition-all flex justify-center items-center gap-2 disabled:opacity-50 text-xs sm:text-sm active:scale-[0.99]"
                  >
                    {isSaving ? <span className="animate-pulse">Saving...</span> : <><Check className="w-5 h-5" /> Save Configuration</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Menu Item Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setIsModalOpen(false);
            } else if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "checkbox") {
              e.preventDefault();
              handleSaveMenu();
            }
          }}
        >
          <div className="bg-white w-full max-w-2xl rounded-t-[2rem] sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-base sm:text-xl font-bold text-slate-900">{editingItem ? "Edit Dish" : "Add New Dish"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-200 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto no-scrollbar flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dish Name *</label>
                  <input
                    type="text"
                    value={menuForm.name}
                    onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    placeholder="e.g. Spicy Chicken Burger"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                  <select
                    value={menuForm.category}
                    onChange={(e) => setMenuForm({ ...menuForm, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 appearance-none"
                  >
                    {categories.filter((c) => c !== "All").map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Price *</label>
                  <input
                    type="number"
                    value={menuForm.price === 0 ? "" : menuForm.price}
                    onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Prep Time (Mins)</label>
                  <input
                    type="number"
                    value={menuForm.prep_time_minutes === 0 ? "" : menuForm.prep_time_minutes}
                    onChange={(e) => setMenuForm({ ...menuForm, prep_time_minutes: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-400" /> Image URL
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={menuForm.image_url}
                    onChange={(e) => setMenuForm({ ...menuForm, image_url: e.target.value })}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    placeholder="https://example.com/image.jpg (optional)"
                  />
                  <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center">
                    {menuForm.image_url ? (
                      <img
                        src={menuForm.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.display = "block"; }}
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
                <textarea
                  value={menuForm.description}
                  onChange={(e) => setMenuForm({ ...menuForm, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 min-h-[90px]"
                  placeholder="Briefly describe the dish..."
                />
              </div>

              <div className="flex flex-wrap gap-4 sm:gap-6 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={menuForm.is_veg} onChange={(e) => setMenuForm({ ...menuForm, is_veg: e.target.checked })} className="w-4 h-4 sm:w-5 sm:h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500" />
                  <span className="text-xs sm:text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">Vegetarian</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={menuForm.is_spicy} onChange={(e) => setMenuForm({ ...menuForm, is_spicy: e.target.checked })} className="w-4 h-4 sm:w-5 sm:h-5 rounded border-slate-300 text-red-500 focus:ring-red-500" />
                  <span className="text-xs sm:text-sm font-bold text-slate-700 group-hover:text-red-600 transition-colors">Spicy</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={menuForm.is_popular} onChange={(e) => setMenuForm({ ...menuForm, is_popular: e.target.checked })} className="w-4 h-4 sm:w-5 sm:h-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                  <span className="text-xs sm:text-sm font-bold text-slate-700 group-hover:text-orange-600 transition-colors">Popular</span>
                </label>
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 sm:gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-4 sm:px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-600 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveMenu} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white px-6 sm:px-8 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 transition-all disabled:opacity-50 flex items-center gap-2">
                {isSaving ? "Saving..." : <><Check className="w-4 h-4" /> Save Dish</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MonitorDot, ChefHat, BarChart3, UtensilsCrossed, Settings, LogOut,
  UserCircle, X, Check, Menu
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";

export function Navbar({ rightActions }: { rightActions?: React.ReactNode }) {
  const pathname = usePathname();
  const { settings } = useSettings();
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [toastMessage, setToastMessage] = useState("");
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const logoutConfirmBtnRef = useRef<HTMLButtonElement>(null);

  const { isAuthenticated, currentUser, logout } = useAuth();

  const handleLogoutConfirm = useCallback(() => {
    setShowLogoutConfirm(false);
    setShowMobileNav(false);
    logout();
  }, [logout]);

  const handleLogoutCancel = useCallback(() => {
    setShowLogoutConfirm(false);
  }, []);

  useEffect(() => {
    if (!showLogoutConfirm) return;
    setTimeout(() => logoutConfirmBtnRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleLogoutCancel();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleLogoutConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showLogoutConfirm, handleLogoutConfirm, handleLogoutCancel]);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (showMobileNav) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showMobileNav]);

  const links = [
    { href: "/menu", label: "Menu", icon: UtensilsCrossed },
    { href: "/kitchen", label: "Kitchen", icon: ChefHat },
    { href: "/cashier", label: "Cashier", icon: MonitorDot },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin", label: "Settings", icon: Settings },
  ];

  const visibleLinks = links.filter(link => {
    if (link.href === "/menu") return true;
    return isAuthenticated;
  });

  const formatDateTime = (date: Date) => {
    const weekday = date.toLocaleString('en-US', { weekday: 'short' });
    const day = date.toLocaleString('en-US', { day: '2-digit' });
    const month = date.toLocaleString('en-US', { month: 'short' });
    const time = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${weekday}, ${day} ${month} | ${time}`;
  };

  const brandDisplayName = settings?.name || "Smart POS";

  // Check if current user is specifically in the Cashier section (/cashier)
  const isCashierPage = pathname.startsWith("/cashier");

  return (
    <>
      <nav className={`fixed top-0 left-0 w-full z-40 transition-all duration-200 no-print flex items-center justify-between px-3 sm:px-6 h-16 shadow-xs flex-nowrap ${scrolled ? "bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs" : "bg-white border-b border-slate-200/80"
        }`}>

        {/* Left Section: Brand, Role & Live Clock */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2.5 shrink-0 pr-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
              <MonitorDot className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-slate-900 font-extrabold text-sm sm:text-base leading-tight tracking-tight truncate">
                Smart POS
              </h1>
              <p className="text-[10px] text-orange-500 font-black uppercase tracking-wider truncate">
                {brandDisplayName}
              </p>
            </div>
          </div>

          {/* Role Badge - Cashier page only */}
          {mounted && isAuthenticated && currentUser && isCashierPage && (
            <div className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200/80 shrink-0">
              <div className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <UserCircle className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Role</span>
                <span className="text-xs font-bold text-slate-800">{currentUser}</span>
              </div>
            </div>
          )}

          {/* Live Clock Badge */}
          {mounted && (
            <div className="hidden xl:flex items-center gap-2 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700 whitespace-nowrap shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {formatDateTime(currentTime)}
            </div>
          )}
        </div>

        {/* Center Section: Main Nav Tabs */}
        <div className="hidden xl:flex items-center justify-center absolute left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/60 shadow-2xs">
            {visibleLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${isActive
                    ? "bg-white text-orange-600 shadow-xs scale-[1.01]"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right Section: Actions & Logout */}
        <div className="flex items-center justify-end gap-2 shrink-0 ml-auto">
          {rightActions}

          {mounted && isAuthenticated && (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              title="Log Out"
              className="h-9 w-9 hidden lg:flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200 transition-all shrink-0 bg-slate-50 active:scale-95"
            >
              <LogOut className="w-4 h-4 stroke-[2]" />
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setShowMobileNav(true)}
            className="xl:hidden h-9 w-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors shrink-0 border border-slate-200"
            aria-label="Open navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {showMobileNav && (
        <div
          className="fixed inset-0 z-[110] xl:hidden flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowMobileNav(false)}
        >
          <div
            className="w-72 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm shadow-orange-500/20">
                  <MonitorDot className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">Smart POS</h3>
                  <p className="text-[9px] text-orange-500 font-bold uppercase tracking-wider">{brandDisplayName}</p>
                </div>
              </div>
              <button
                onClick={() => setShowMobileNav(false)}
                className="p-1.5 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-3">Navigation</p>
              {visibleLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                const Icon = link.icon;
                const emoji = link.href === '/menu' ? '🍽️' : link.href === '/cashier' ? '💵' : link.href === '/kitchen' ? '👨‍🍳' : link.href === '/analytics' ? '📊' : '⚙️';

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setShowMobileNav(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${isActive
                      ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-xs'
                      : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                      }`}
                  >
                    <span className="text-base leading-none">{emoji}</span>
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                    {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-orange-500" />}
                  </Link>
                );
              })}
            </div>

            {mounted && isAuthenticated && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
                {currentUser && isCashierPage && (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-xs">
                    <UserCircle className="w-5 h-5 text-orange-500" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Logged in as</p>
                      <p className="text-slate-800 font-bold">{currentUser}</p>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-sm font-bold hover:bg-rose-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-xl shadow-slate-900/20 font-bold text-sm z-[99999] animate-in fade-in slide-in-from-top-4 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" /> {toastMessage}
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={handleLogoutCancel}
        >
          <div
            className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200 border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-5 shadow-inner border border-rose-100">
              <LogOut className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Log Out</h2>
            <p className="text-sm font-medium text-slate-500 mb-6">Are you sure you want to log out?</p>
            <div className="flex gap-3">
              <button
                onClick={handleLogoutCancel}
                className="flex-1 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-all active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                ref={logoutConfirmBtnRef}
                onClick={handleLogoutConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-all shadow-[0_8px_20px_rgba(225,29,72,0.25)] active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-rose-250"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-4 font-medium">Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px]">Enter</kbd> to confirm · <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px]">Esc</kbd> to cancel</p>
          </div>
        </div>
      )}
    </>
  );
}
"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";

export interface MenuItem {
    id: string;
    name: string;
    description?: string;
    price: number;
    category: string;
    image_url?: string;
    is_veg?: boolean;
    is_spicy?: boolean;
    is_popular?: boolean;
    is_available?: boolean;
    large_item?: MenuItem;
}

interface MenuItemCardProps {
    item: MenuItem;
    currencySymbol?: string;
    onAddToCart: (item: MenuItem, selectedSize: "Regular" | "Large", finalPrice: number) => void;
}

// Lag එක වැළැක්වීමට w=300 & q=60 (Ultra-light thumbnail sizes)
const CATEGORY_IMAGES: Record<string, string> = {
    "Fried Rice (Keeri Samba)": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=300&q=60&auto=format&fit=crop",
    "Fried Rice (Basmathi)": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&q=60&auto=format&fit=crop",
    "Noodles": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=300&q=60&auto=format&fit=crop",
    "Chopsuey": "https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=300&q=60&auto=format&fit=crop",
    "Kottu": "https://images.unsplash.com/photo-1625398407796-82650a8c135f?w=300&q=60&auto=format&fit=crop",
    "Cheese Kottu": "https://images.unsplash.com/photo-1625398407796-82650a8c135f?w=300&q=60&auto=format&fit=crop",
    "Idiyappam Kottu": "https://images.unsplash.com/photo-1625398407796-82650a8c135f?w=300&q=60&auto=format&fit=crop",
    "Soup": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=300&q=60&auto=format&fit=crop",
    "Quick & Easy": "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=300&q=60&auto=format&fit=crop",
    "Fresh Salad": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300&q=60&auto=format&fit=crop",
    "Italian": "https://images.unsplash.com/photo-1621996346565-e3d5d6281691?w=300&q=60&auto=format&fit=crop",
    "Gamigedara Special": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&q=60&auto=format&fit=crop",
    "Family Pack": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=300&q=60&auto=format&fit=crop",
    "Chicken Bytes": "https://images.unsplash.com/photo-1562967914-608f82629710?w=300&q=60&auto=format&fit=crop",
    "Seafood Bytes": "https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=300&q=60&auto=format&fit=crop",
};

const DEFAULT_FOOD_IMG = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&q=60&auto=format&fit=crop";

export default function MenuItemCard({ item, currencySymbol = "LKR", onAddToCart }: MenuItemCardProps) {
    const hasLargeOption = Boolean(item.large_item);
    const [selectedSize, setSelectedSize] = useState<"Regular" | "Large">("Regular");

    const activeItem = selectedSize === "Large" && item.large_item ? item.large_item : item;
    const currentPrice = Number(activeItem.price || 0);

    const displayImage = item.image_url?.trim()
        ? item.image_url
        : (CATEGORY_IMAGES[item.category] || DEFAULT_FOOD_IMG);

    return (
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col justify-between hover:border-orange-200 transition-colors [contain:content]">
            <div>
                {/* Optimized Image Box */}
                <div className="relative h-28 w-full rounded-xl overflow-hidden mb-2 bg-slate-100">
                    <img
                        src={displayImage}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.currentTarget.src = DEFAULT_FOOD_IMG;
                        }}
                    />
                    <span className="absolute top-2 left-2 bg-slate-900/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                        ⏱ 15m
                    </span>

                    <div className="absolute top-2 right-2 flex gap-1">
                        {item.is_veg && (
                            <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                                VEG
                            </span>
                        )}
                        {item.is_spicy && (
                            <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                                SPICY
                            </span>
                        )}
                    </div>
                </div>

                <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-1" title={item.name}>
                    {item.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {item.description ? item.description.replace(/\(Large portion\)/gi, "").trim() : "Freshly prepared"}
                </p>
            </div>

            <div className="mt-2.5">
                {hasLargeOption ? (
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-2.5 gap-1">
                        <button
                            type="button"
                            onClick={() => setSelectedSize("Regular")}
                            className={`flex-1 text-xs py-1 rounded-lg font-bold transition-colors ${selectedSize === "Regular"
                                    ? "bg-white text-orange-600 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            Regular
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedSize("Large")}
                            className={`flex-1 text-xs py-1 rounded-lg font-bold transition-colors ${selectedSize === "Large"
                                    ? "bg-white text-orange-600 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            Large
                        </button>
                    </div>
                ) : (
                    <div className="h-6 mb-2" />
                )}

                {/* Dynamic Currency Display */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-baseline gap-1">
                        <span className="text-[11px] font-bold text-slate-400">
                            {currencySymbol}
                        </span>
                        <span className="text-base font-black text-slate-900 tracking-tight">
                            {currentPrice.toLocaleString()}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={() => onAddToCart(activeItem, selectedSize, currentPrice)}
                        className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-xs px-3 py-1.5 rounded-xl font-bold transition shadow-sm whitespace-nowrap"
                    >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" /> Add
                    </button>
                </div>
            </div>
        </div>
    );
}
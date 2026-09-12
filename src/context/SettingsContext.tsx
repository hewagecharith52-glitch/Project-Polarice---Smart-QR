"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface TableConfig {
  id: string;
  name: string;
  capacity: number;
  section: string;
}

export interface RestaurantSettings {
  id?: number | string;
  name: string;
  tagline: string;
  currency: string;
  service_charge_pct: number;
  tax_pct: number;
  table_count: number;
  phone?: string;
  address?: string;
  tables?: TableConfig[];
}

const defaultSettings: RestaurantSettings = {
  id: 1,
  name: "The Grand Aroma",
  tagline: "Smart POS",
  currency: "LKR",
  service_charge_pct: 10,
  tax_pct: 0,
  table_count: 8,
  phone: "+94 77 123 4567",
  address: "123 Main Street, Colombo",
  tables: [
    { id: "1", name: "Table 01", capacity: 4, section: "Main Hall" },
    { id: "2", name: "Table 02", capacity: 4, section: "Main Hall" },
    { id: "3", name: "Table 03", capacity: 2, section: "Main Hall" },
    { id: "4", name: "Table 04", capacity: 6, section: "Main Hall" },
    { id: "5", name: "Table 05", capacity: 4, section: "Main Hall" },
    { id: "6", name: "VIP-1", capacity: 8, section: "VIP Lounge" },
    { id: "7", name: "Terrace-1", capacity: 4, section: "Terrace" },
    { id: "8", name: "Terrace-2", capacity: 2, section: "Terrace" }
  ]
};

interface SettingsContextType {
  settings: RestaurantSettings;
  updateSettings: (newSettings: Partial<RestaurantSettings>) => Promise<boolean>;
  refreshSettings: () => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: async () => false,
  refreshSettings: async () => { },
  loading: false,
});

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<RestaurantSettings>(defaultSettings);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select("*")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        const hasValidTables = Array.isArray(data.tables) && data.tables.length > 0;
        const resolvedTables = hasValidTables ? data.tables : defaultSettings.tables;

        setSettings({
          ...defaultSettings,
          ...data,
          id: Number(data.id) || 1,
          name: data.name || defaultSettings.name,
          tagline: data.tagline ?? defaultSettings.tagline,
          currency: data.currency || defaultSettings.currency,
          service_charge_pct: Number.isFinite(Number(data.service_charge_pct)) ? Number(data.service_charge_pct) : 0,
          tax_pct: Number.isFinite(Number(data.tax_pct)) ? Number(data.tax_pct) : 0,
          table_count: resolvedTables?.length || Number(data.table_count) || 8,
          tables: resolvedTables
        });
      }
    } catch (err) {
      console.warn("Could not fetch settings from Supabase, using defaults:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel("realtime-restaurant-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_settings" },
        () => {
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  const updateSettings = async (newSettings: Partial<RestaurantSettings>): Promise<boolean> => {
    try {
      const targetId = Number(settings.id) || 1;
      const sCharge = Number(newSettings.service_charge_pct ?? settings.service_charge_pct);
      const tax = Number(newSettings.tax_pct ?? settings.tax_pct);

      const payload: any = {
        ...settings,
        ...newSettings,
        id: targetId,
        service_charge_pct: Number.isFinite(sCharge) ? sCharge : 0,
        tax_pct: Number.isFinite(tax) ? tax : 0,
        updated_at: new Date().toISOString()
      };

      setSettings(payload);

      const { error } = await supabase
        .from("restaurant_settings")
        .upsert(payload, { onConflict: "id" });

      if (error) {
        console.error("Error upserting restaurant_settings:", error);
        return false;
      }

      await fetchSettings();
      return true;
    } catch (err) {
      console.error("Error updating settings:", err);
      return false;
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, refreshSettings: fetchSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
export default SettingsContext;
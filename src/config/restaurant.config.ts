export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  tags: string[];
  image_url: string;
  prep_time_minutes: number;
  is_available?: boolean;
  created_at?: string;
}

export const restaurantConfig = {
  name: "The Grand Aroma",
  tagline: "Authentic Taste & Quality Cafe",
  currency: "LKR",
  service_charge_pct: 10,
  tax_pct: 0,
  table_count: 20,
  manager_pin: "1234",
  phone: "+94 77 123 4567",
  address: "Colombo, Sri Lanka",
  categories: ["Starters", "Mains", "Desserts", "Beverages"],
  menu: [
    {
      id: "m1",
      name: "Paneer Tikka Masala",
      description: "Charcoal grilled paneer in a rich tomato gravy",
      price: 320,
      category: "Mains",
      tags: ["Veg", "Popular"],
      image_url: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=800",
      prep_time_minutes: 15,
      is_available: true,
    },
    {
      id: "m2",
      name: "Butter Chicken",
      description: "Tender chicken cooked in a creamy tomato sauce",
      price: 450,
      category: "Mains",
      tags: ["Popular"],
      image_url: "https://images.unsplash.com/photo-1603894584373-5ac82bea3d96?auto=format&fit=crop&q=80&w=800",
      prep_time_minutes: 20,
      is_available: true,
    },
    {
      id: "s1",
      name: "Crispy Spring Rolls",
      description: "Vegetable stuffed golden fried rolls with sweet chili dip",
      price: 180,
      category: "Starters",
      tags: ["Veg"],
      image_url: "https://images.unsplash.com/photo-1544025162-8111f9fbd1a8?auto=format&fit=crop&q=80&w=800",
      prep_time_minutes: 10,
      is_available: true,
    },
    {
      id: "s2",
      name: "Chili Chicken",
      description: "Spicy pan-fried chicken with peppers and onions",
      price: 260,
      category: "Starters",
      tags: ["Spicy"],
      image_url: "https://images.unsplash.com/photo-1564834724105-918b73d1b9e0?auto=format&fit=crop&q=80&w=800",
      prep_time_minutes: 12,
      is_available: true,
    },
    {
      id: "d1",
      name: "Gulab Jamun",
      description: "Soft milk dumplings soaked in cardamom syrup",
      price: 120,
      category: "Desserts",
      tags: ["Veg"],
      image_url: "https://images.unsplash.com/photo-1596450514735-a50e979a7852?auto=format&fit=crop&q=80&w=800",
      prep_time_minutes: 5,
      is_available: true,
    },
    {
      id: "b1",
      name: "Mango Lassi",
      description: "Refreshing yogurt drink blended with sweet mangoes",
      price: 90,
      category: "Beverages",
      tags: ["Veg"],
      image_url: "https://images.unsplash.com/photo-1546889598-a6e5a6fc56be?auto=format&fit=crop&q=80&w=800",
      prep_time_minutes: 5,
      is_available: true,
    }
  ] as MenuItem[]
};
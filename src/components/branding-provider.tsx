
"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

type BrandingContextType = {
  institutionName: string;
  institutionLogo: string;
  updateBranding: (name: string, logo: string) => void;
};

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState("IED Nicolas Buenaventura");
  const defaultLogo = PlaceHolderImages.find(img => img.id === 'institution-logo')?.imageUrl || "";
  const [logo, setLogo] = useState(defaultLogo);

  // In a real app, this would fetch from Supabase on mount
  useEffect(() => {
    const savedName = localStorage.getItem('branding_name');
    const savedLogo = localStorage.getItem('branding_logo');
    if (savedName) setName(savedName);
    if (savedLogo) setLogo(savedLogo);
  }, []);

  const updateBranding = (newName: string, newLogo: string) => {
    setName(newName);
    setLogo(newLogo);
    localStorage.setItem('branding_name', newName);
    localStorage.setItem('branding_logo', newLogo);
  };

  return (
    <BrandingContext.Provider value={{ institutionName: name, institutionLogo: logo, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (!context) throw new Error("useBranding must be used within BrandingProvider");
  return context;
};

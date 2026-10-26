"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { MealPlanProvider } from "@/lib/MealPlanProvider";

/** The login page renders bare; every other page gets the meal-plan data, header and nav. */
export default function AppChrome({
  children,
  showSignOut,
}: {
  children: ReactNode;
  showSignOut: boolean;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <MealPlanProvider>
      <div className="relative mx-auto min-h-screen max-w-md pb-[120px]">
        <Header showSignOut={showSignOut} />
        {children}
        <BottomNav />
      </div>
    </MealPlanProvider>
  );
}

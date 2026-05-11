import React from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useUser } from "@/lib/UserContext";

export default function Dashboard() {
  const { user } = useUser();

  return (
    <MainLayout>
      <div className="p-6">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Overview</h1>
      </div>
    </MainLayout>
  );
}

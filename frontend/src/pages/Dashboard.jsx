import { Navigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { useUser } from "@/lib/UserContext";
import { PERSONNEL_ROLES } from "@/pages/admin/utils";

// Sign-in lands here. There's no overview yet, so send staff straight to their
// case conversations instead of an empty page.
export default function Dashboard() {
  const { user } = useUser();
  if (PERSONNEL_ROLES.includes(user?.role)) return <Navigate to="/messages?view=cases" replace />;
  return (
    <MainLayout>
      <div className="p-6">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Overview</h1>
      </div>
    </MainLayout>
  );
}

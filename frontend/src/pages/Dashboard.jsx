import { Navigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { useUser } from "@/lib/UserContext";
import { PERSONNEL_ROLES } from "@/pages/admin/utils";
import { useAppSettings } from "@/lib/appSettings";

// Sign-in lands here. There's no overview yet, so send staff straight to their
// conversations: Leads during the intake rollout, Cases once cases are turned on.
export default function Dashboard() {
  const { user } = useUser();
  const { cases_enabled: casesEnabled, loaded } = useAppSettings();
  if (PERSONNEL_ROLES.includes(user?.role)) {
    if (!loaded) return null;
    return <Navigate to={casesEnabled ? "/messages?view=cases" : "/leads"} replace />;
  }
  return (
    <MainLayout>
      <div className="p-6">
        <h1 className="text-[1.375rem] font-bold tracking-tight text-foreground">Overview</h1>
      </div>
    </MainLayout>
  );
}

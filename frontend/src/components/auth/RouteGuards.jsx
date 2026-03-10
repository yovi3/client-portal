import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { fetchCurrentUser, getStoredUser } from "@/lib/auth";

const useAuthUser = () => {
  const [user, setUser] = useState(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser || null);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { user, isLoading };
};

export function RequireAuth({ children }) {
  const { user, isLoading } = useAuthUser();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Authenticating...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function RequireRole({ allowedRoles, children }) {
  const { user, isLoading } = useAuthUser();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Checking access...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

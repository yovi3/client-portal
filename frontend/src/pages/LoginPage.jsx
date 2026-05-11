import React, { useState } from "react";
import { Scale, Eye, EyeOff, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  const [formData, setFormData] = useState({ email: "", password: "", remember: false });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const validate = () => {
    const next = {};
    if (!formData.email) next.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) next.email = "Invalid email address";
    if (!formData.password) next.password = "Password is required";
    else if (formData.password.length < 6) next.password = "Minimum 6 characters";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("user", JSON.stringify(data));
        toast.success("Signed in successfully");
        setTimeout(() => navigate("/dashboard"), 800);
      } else {
        toast.error(data.detail || "Invalid email or password");
      }
    } catch {
      toast.error("Could not connect to the server");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <Scale className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground tracking-tight">Injury Case Portal</span>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue</p>
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="pt-6 pb-6 space-y-4">
            <button
              type="button"
              onClick={() => { window.location.href = `${API_BASE_URL}/auth/azure/start`; }}
              className="w-full flex items-center justify-center gap-2.5 border border-border rounded-md py-2 px-3 text-sm font-medium text-foreground bg-card hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0H10.9091V10.9091H0V0Z" fill="#F25022" />
                <path d="M12.0908 0H23V10.9091H12.0908V0Z" fill="#7FBA00" />
                <path d="M0 12.0908H10.9091V23H0V12.0908Z" fill="#00A4EF" />
                <path d="M12.0908 12.0908H23V23H12.0908V12.0908Z" fill="#FFB900" />
              </svg>
              Sign in with Microsoft
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  className={errors.email ? "border-destructive focus-visible:ring-destructive/30" : ""}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    className={errors.password ? "border-destructive focus-visible:ring-destructive/30 pr-10" : "pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="remember"
                    checked={formData.remember}
                    onChange={handleChange}
                    className="rounded border-input accent-primary"
                  />
                  <span className="text-muted-foreground">Remember me</span>
                </label>
                <a href="/forgot-password" className="text-primary hover:underline text-xs">
                  Forgot password?
                </a>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-primary hover:underline font-medium">Create one</a>
        </p>
      </div>
    </div>
  );
}

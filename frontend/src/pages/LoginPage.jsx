import React, { useState } from "react";
import { Scale, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom"; // <-- ADDED
import { toast } from "sonner"; // <-- ADDED

export default function LoginPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    remember: false,
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate(); // <-- ADDED

  const validate = () => {
    const newErrors = {};
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Email is invalid";

    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const res = await fetch("http://localhost:8002/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // --- UPDATED ---
        toast.success("Login successful!", {
          description: "Redirecting you to the dashboard...",
        });
        
        // TODO: Save user data/token to context or localStorage
        localStorage.setItem("user", JSON.stringify(data.user));
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate("/dashboard");
        }, 1500);
        // --- END UPDATE ---
      } else {
        // --- UPDATED ---
        toast.error("Login Failed", {
          description: data.detail || "Invalid email or password.",
        });
        // --- END UPDATE ---
      }
    } catch (err) {
      console.error(err);
      // --- UPDATED ---
      toast.error("Connection Error", {
        description: "Could not connect to the server.",
      });
      // --- END UPDATE ---
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }));
  };

  const handleAzureLogin = () => {
    // This flow will redirect the user. The success/error handling
    // will need to happen on the page Azure redirects *back* to.
    window.location.href = "http://localhost:8002/azure-login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-6">
            <Scale className="h-8 w-8 text-black" />
            <span className="text-2xl font-semibold">Client Portal</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
          <p className="text-gray-600">Sign in to your account to continue</p>
        </div>

        {/* Azure login */}
        <button
          onClick={handleAzureLogin}
          className="w-full flex items-center justify-center gap-2 border border-black text-black py-2 rounded-md hover:bg-gray-100 mb-4"
        >
          <img src="/azure-icon.svg" alt="Azure" className="h-5 w-5" />
          Sign in with Microsoft
        </button>

        <div className="flex items-center mb-4">
          <hr className="flex-1 border-black/20" />
          <span className="mx-2 text-black/50 text-sm">or continue with email</span>
          <hr className="flex-1 border-black/20" />
        </div>

        {/* Manual login form */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-black mb-1">Email</label>
            <Mail className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="w-full pl-10 pr-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
            />
            {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-black mb-1">Password</label>
            <Lock className="absolute left-3 top-9 h-5 w-5 text-black/50" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full pl-10 pr-10 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-9 h-5 w-5 text-black/50"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
            {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="inline-flex items-center gap-2 text-black/80">
              <input
                type="checkbox"
                name="remember"
                checked={formData.remember}
                onChange={handleChange}
                className="border border-black rounded"
              />
              Remember me
            </label>
            <a href="/forgot-password" className="text-black/80 hover:underline">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white py-2 rounded-md hover:bg-gray-800 transition-colors font-medium"
          >
            Sign In
          </button>
        </form>

        <p className="text-sm text-black/70 mt-4 text-center">
          Don't have an account?{" "}
          <a href="/register" className="underline">
            Create an account
          </a>
        </p>
      </div>
    </div>
  );
}
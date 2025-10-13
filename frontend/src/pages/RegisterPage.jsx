import React, { useState } from "react";
import { Scale, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    remember: false,
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validate = () => {
    const newErrors = {};

    if (!formData.fullName) newErrors.fullName = "Full name is required";
    else if (formData.fullName.length < 2) newErrors.fullName = "Name must be at least 2 characters";

    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Email is invalid";

    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 8) newErrors.password = "Password must be at least 8 characters";

    if (!formData.confirmPassword) newErrors.confirmPassword = "Please confirm your password";
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const res = await fetch("http://localhost:5000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) alert("Registration successful!");
      else alert(data.message || "Registration failed");
    } catch (err) {
      console.error(err);
      alert("Error connecting to server");
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
    window.location.href = "http://localhost:5000/api/login/azure";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-lg bg-white shadow-md rounded-lg p-6">
        <div className="text-center mb-6">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <Scale className="h-8 w-8 text-black" />
            <span className="text-2xl font-semibold">Client Portal</span>
          </a>
          <h1 className="text-3xl font-bold mb-2">Create an account</h1>
          <p className="text-gray-600">Get started with your client management</p>
        </div>

        {/* Azure login button */}
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

        {/* Manual registration form */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-black mb-1">Full Name</label>
            <input
              type="text"
              name="fullName"
              placeholder="Full Name"
              value={formData.fullName}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
            />
            {errors.fullName && <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>}
          </div>

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

            <div className="flex flex-col md:flex-row gap-4">
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

            <div className="relative">
                <label className="block text-sm font-medium text-black mb-1">Confirm Password</label>
                <Lock className="absolute left-3 top-9 h-5 w-5 text-black/50" />
                <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full pl-10 pr-10 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                />
                <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-9 h-5 w-5 text-black/50"
                >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                {errors.confirmPassword && <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>}
            </div>
            </div>

          <div className="flex items-center gap-2 text-sm">
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
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white py-2 rounded-md hover:bg-gray-800 transition-colors font-medium"
          >
            Create Account
          </button>
        </form>

        <p className="text-sm text-black/70 mt-4 text-center">
          Already have an account?{" "}
          <a href="/login" className="underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

import React, { useState } from "react"
import { Scale, Mail, Lock, Eye, EyeOff, User } from "lucide-react"
import { Toaster, toast } from "sonner"

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "", 
    confirmPassword: "",
  })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleAzureLogin = () => {
    const clientId = "YOUR_AZURE_CLIENT_ID"
    const tenantId = "YOUR_TENANT_ID"
    const redirectUri = encodeURIComponent(window.location.origin + "/auth/callback")
    const scope = encodeURIComponent("openid profile email")
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scope}`
    window.location.href = authUrl
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name) newErrors.name = "Full name is required"
    else if (formData.name.length < 2) newErrors.name = "Name must be at least 2 characters"

    if (!formData.email) newErrors.email = "Email is required"
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Email is invalid"

    if (!formData.password) newErrors.password = "Password is required"
    else if (formData.password.length < 8) newErrors.password = "Password must be at least 8 characters"

    if (!formData.confirmPassword) newErrors.confirmPassword = "Please confirm your password"
    else if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)

    try {
      const res = await fetch("http://0.0.0.0:8002/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success("✅ Registration successful! You can now log in.")
        setTimeout(() => (window.location.href = "/login"), 1500)
      } else {
        toast.error(`❌ Registration failed: ${data.detail || "Please try again."}`)
      }
    } catch (err) {
      console.error(err)
      toast.error("⚠️ Connection error: Could not connect to the server.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }))
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-lg bg-white shadow-md rounded-lg p-6">
        <div className="text-center mb-6">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <Scale className="h-8 w-8 text-black" />
            <span className="text-2xl font-semibold">Client Portal</span>
          </a>
          <h1 className="text-3xl font-bold mb-2">Create Lawyer Account</h1>
          <p className="text-gray-600">Register to manage your clients and cases</p>
        </div>

        {/* Azure login button */}
        <button
          onClick={handleAzureLogin}
          type="button"
          className="w-full flex items-center justify-center gap-2 border border-black text-black py-2 rounded-md hover:bg-gray-100 transition-colors mb-4"
        >
          <svg className="h-5 w-5" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0H10.9091V10.9091H0V0Z" fill="#F25022" />
            <path d="M12.0908 0H23V10.9091H12.0908V0Z" fill="#7FBA00" />
            <path d="M0 12.0908H10.9091V23H0V12.0908Z" fill="#00A4EF" />
            <path d="M12.0908 12.0908H23V23H12.0908V12.0908Z" fill="#FFB900" />
          </svg>
          Sign in with Microsoft
        </button>

        <div className="flex items-center mb-4">
          <hr className="flex-1 border-black/20" />
          <span className="mx-2 text-black/50 text-sm">or continue with email</span>
          <hr className="flex-1 border-black/20" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-black mb-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                value={formData.name}
                onChange={handleChange}
                autoComplete="name"
                className="w-full pl-10 pr-3 py-2 border border-black rounded-md focus:ring-2 focus:ring-black focus:outline-none"
              />
            </div>
            {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-black mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                className="w-full pl-10 pr-3 py-2 border border-black rounded-md focus:ring-2 focus:ring-black focus:outline-none"
              />
            </div>
            {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
          </div>

          {/* Passwords */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Password */}
            <div className="relative w-full">
              <label className="block text-sm font-medium text-black mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-black/50" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2 border border-black rounded-md focus:ring-2 focus:ring-black focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-black/50"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div className="relative w-full">
              <label className="block text-sm font-medium text-black mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-black/50" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2 border border-black rounded-md focus:ring-2 focus:ring-black focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-black/50"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white py-2 rounded-md hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p className="text-sm text-black/70 mt-4 text-center">
          Already have an account?{" "}
          <a href="/login" className="underline hover:text-black">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}

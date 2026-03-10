import React, { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { apiFetch } from "@/lib/api";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  phone: "",
  address: "",
  password: "",
  confirmPassword: "",
};

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!token) {
      setError("Invite token is missing.");
      setIsLoadingPreview(false);
      return;
    }

    let active = true;
    setIsLoadingPreview(true);
    setError("");
    apiFetch(`/invites/preview?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(data.detail || "Invite is invalid.");
          setPreview(null);
          return;
        }
        setPreview(data);
        setFormData((prev) => ({
          ...prev,
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          phone: data.phone || "",
          address: data.address || "",
        }));
      })
      .catch(() => {
        if (!active) return;
        setError("Failed to validate invite.");
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingPreview(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!formData.first_name.trim()) return "First name is required.";
    if (!formData.last_name.trim()) return "Last name is required.";
    if (!formData.phone.trim()) return "Phone is required.";
    if (!formData.address.trim()) return "Address is required.";
    if (!formData.password) return "Password is required.";
    if (formData.password.length < 8) return "Password must be at least 8 characters.";
    if (formData.password !== formData.confirmPassword) return "Passwords do not match.";
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch("/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          password: formData.password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || "Failed to accept invite.");
        return;
      }
      toast.success("Account created. Please sign in.");
      navigate("/login", { replace: true });
    } catch {
      toast.error("Connection error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-lg rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <a href="/" className="inline-flex items-center gap-2 mb-4">
            <Scale className="h-8 w-8 text-black" />
            <span className="text-2xl font-semibold">Injury Case Portal</span>
          </a>
          <h1 className="text-2xl font-bold">Accept Invite</h1>
        </div>

        {isLoadingPreview ? (
          <p className="text-center text-sm text-gray-600">Checking invite...</p>
        ) : error ? (
          <div className="space-y-3">
            <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
            <a href="/login" className="inline-block text-sm underline">
              Back to login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-black">Invited Email</label>
              <input
                value={preview?.invited_email || ""}
                disabled
                className="w-full rounded-md border border-black bg-gray-100 px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-black">First Name</label>
                <input
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="w-full rounded-md border border-black px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black">Last Name</label>
                <input
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="w-full rounded-md border border-black px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-black">Phone</label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full rounded-md border border-black px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-black">Address</label>
              <input
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full rounded-md border border-black px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-black">Password</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full rounded-md border border-black px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-black">Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full rounded-md border border-black px-3 py-2"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-black py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

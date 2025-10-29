import React, { useEffect, useState } from "react"
import { Scale } from "lucide-react"

export default function AzureCallback() {
  const [status, setStatus] = useState("processing")
  const [message, setMessage] = useState("Processing Azure login...")

  useEffect(() => {
    // Extract token from URL hash
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")

    if (!accessToken) {
      setStatus("error")
      setMessage("No access token received from Azure")
      return
    }

    // Send token to backend
    handleAzureCallback(accessToken)
  }, [])

  const handleAzureCallback = async (token) => {
    try {
      const res = await fetch(`http://0.0.0.0:8002/azure-login?token=${token}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

      const data = await res.json()

      if (res.ok) {
        setStatus("success")
        setMessage("Login successful! Redirecting...")
        
        // Store user data (you might want to use proper state management)
        localStorage.setItem("user", JSON.stringify(data.user))
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          window.location.href = "/dashboard"
        }, 2000)
      } else {
        setStatus("error")
        setMessage(data.detail || "Azure login failed")
      }
    } catch (err) {
      console.error(err)
      setStatus("error")
      setMessage("Could not connect to the server")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-8 text-center">
        <a href="/" className="inline-flex items-center gap-2 mb-6">
          <Scale className="h-8 w-8 text-black" />
          <span className="text-2xl font-semibold">Client Portal</span>
        </a>

        {status === "processing" && (
          <div>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-black mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">{message}</h2>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-xl font-semibold mb-2 text-green-600">{message}</h2>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="text-red-600 text-6xl mb-4">✗</div>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Login Failed</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <a
              href="/register"
              className="inline-block bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              Back to Registration
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
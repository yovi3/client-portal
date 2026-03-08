import React, { useEffect, useState } from "react"
import { Scale } from "lucide-react"

export default function AzureCallback() {
  const [status, setStatus] = useState("processing")
  const [message, setMessage] = useState("Completing Microsoft sign-in...")

  useEffect(() => {
    setStatus("processing")
    setMessage("Completing Microsoft sign-in...")
    const timer = setTimeout(() => {
      window.location.href = "/dashboard"
    }, 1200)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-8 text-center">
        <a href="/" className="inline-flex items-center gap-2 mb-6">
          <Scale className="h-8 w-8 text-black" />
          <span className="text-2xl font-semibold">Injury Case Portal</span>
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
            <h2 className="text-xl font-semibold mb-2 text-red-600">Sign-in Failed</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <a
              href="/login"
              className="inline-block bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              Back to Login
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

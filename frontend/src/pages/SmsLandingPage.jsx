"use client";

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Calendar as CalendarIcon, // Import CalendarIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster, toast } from "sonner"; // Import Sonner
import { format } from "date-fns"; // Import date-fns for formatting

// --- CONFIG ---
const API_BASE_URL = "http://127.0.0.1:8002";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

// --- HELPERS ---
const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 MB";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(2)} MB`;
};

// --- MAIN COMPONENT ---
export default function SmsLandingPage() {
  const { token } = useParams(); // Get token from URL

  // --- STATE ---
  const [requestData, setRequestData] = useState(null);
  const [uploads, setUploads] = useState({}); // { docId: { file, name, size } }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState(null); // For page-level errors (e.g., bad token)
  const [isLoading, setIsLoading] = useState(true);

  // --- 1. FETCH REQUEST DATA ---
  useEffect(() => {
    if (!token) {
      setError("Access token missing. Please ensure the link is correct.");
      setIsLoading(false);
      return;
    }

    const fetchRequestData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/requests/${token}`);
        if (!response.ok) {
          const errData = await response
            .json()
            .catch(() => ({ detail: "Unknown server error." }));
          throw new Error(errData.detail || "Link invalid or expired.");
        }
        const data = await response.json();

        if (data.status === "completed") {
          setIsSuccess(true);
          // Set error as well to show the message on the success page
          setError("This request has already been completed and closed.");
          return;
        }

        setRequestData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequestData();
  }, [token]);

  // --- 2. FILE HANDLING ---
  const processFile = (docId, file) => {
    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(
        `File "${file.name}" is too large. Max size is 10MB.`
      );
      return;
    }
    
    // Validate type (basic)
    const fileExtension = "." + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_FILE_TYPES.includes(fileExtension)) {
         toast.error(
        `File type "${fileExtension}" is not allowed. Please upload: PDF, JPG, PNG, or DOC/DOCX.`
      );
      return;
    }

    setUploads((prev) => ({
      ...prev,
      [docId]: {
        file: file,
        name: file.name,
        size: formatFileSize(file.size),
      },
    }));
  };

  const handleFileChange = (docId, files) => {
    if (files && files.length > 0) {
      processFile(docId, files[0]);
    }
  };

  const handleDrop = (e, docId) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(docId, files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (docId) => {
    setUploads((prev) => {
      const newUploads = { ...prev };
      delete newUploads[docId];
      return newUploads;
    });
  };

  // --- 3. FORM SUBMISSION ---
  const handleSubmit = async () => {
    setIsSubmitting(true);
    // Use toast for submission errors
    
    const requestId = requestData?.id;
    if (!requestId) {
      toast.error("Request ID missing. Please refresh the page.");
      setIsSubmitting(false);
      return;
    }

    try {
      const formData = new FormData();
      Object.entries(uploads).forEach(([docId, upload]) => {
        // The backend expects the key to be the document ID
        formData.append(docId, upload.file, upload.name);
      });

      const response = await fetch(
        `${API_BASE_URL}/requests/${requestId}/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ detail: "Unknown upload error." }));
        throw new Error(errData.detail || "Upload failed.");
      }

      // Success!
      setIsSuccess(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if all required documents are staged for upload
  const allRequiredUploaded =
    requestData?.requested_documents?.every((doc) => uploads[doc.id]) || false;

  // --- RENDER STATES ---

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <span className="ml-3 text-lg text-muted-foreground">
          Loading Request...
        </span>
      </div>
    );
  }

  if (error && !isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-2xl">Access Error</CardTitle>
            <CardDescription className="text-base">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardHeader>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-2xl">
              Documents Uploaded Successfully!
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Thank you! Your documents have been delivered and will be
              reviewed by your lawyer shortly.
            </CardDescription>
            {/* Show error message here if it was a "completed" error */}
            {error && (
                 <AlertDescription className="text-base mt-4 text-muted-foreground">{error}</AlertDescription>
            )}
          </CardHeader>
        </Card>
      </div>
    );
  }

  // --- MAIN RENDER ---
  const clientName = requestData?.case?.client_user?.name || "Client";
  const caseTitle = requestData?.case?.title || "Case";
  const lawyerName = requestData?.case?.assigned_lawyer_user?.name || "Lawyer";
  const documents = requestData?.requested_documents || [];
  const deadline = requestData?.deadline;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-800">
            Case Documents
          </h1>
          <p className="text-lg text-gray-500">
            Please upload all required files for case{" "}
            <strong>{caseTitle}</strong>.
          </p>
        </header>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Client:</span>
              <span className="font-semibold text-gray-700">{clientName}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Case:</span>
              <span className="font-semibold text-gray-700">{caseTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Assigned Lawyer:
              </span>
              <span className="font-semibold text-gray-700">{lawyerName}</span>
            </div>
            
            {/* NEW: Deadline Display */}
            {deadline && (
                 <div className="flex justify-between items-center border-t pt-3 mt-3 text-red-600 font-bold">
                    <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Submission Deadline:
                    </span>
                    <span>
                        {format(new Date(deadline), 'MMM d, yyyy h:mm a')}
                    </span>
                 </div>
            )}
          </CardContent>
        </Card>

        {/* Note: File validation errors are now handled by toast, so no inline alert is needed */}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">
              Required Files ({documents.length})
            </CardTitle>
            <CardDescription>
              Please upload files in <strong>PDF, JPG, PNG, DOC/DOCX</strong> formats. Max file size: <strong>10 MB</strong>.
            </CardDescription>
          </CardHeader>
          {/* Set max height for many documents */}
          <ScrollArea className="h-auto max-h-[400px]">
            <CardContent className="space-y-6 p-6">
              {documents.map((doc) => (
                <div key={doc.id} className="border-b pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <span className="font-bold text-gray-800">{doc.name}</span>
                    </div>
                    {uploads[doc.id] && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                  </div>

                  {!uploads[doc.id] ? (
                    // Dropzone
                    <div
                      onDrop={(e) => handleDrop(e, doc.id)}
                      onDragOver={handleDragOver}
                      className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50 hover:border-blue-500 transition-all cursor-pointer group"
                    >
                      <Input
                        type="file"
                        id={`file-${doc.id}`}
                        className="hidden"
                        onChange={(e) => handleFileChange(doc.id, e.target.files)}
                        accept={ACCEPTED_FILE_TYPES}
                      />
                      <label
                        htmlFor={`file-${doc.id}`}
                        className="cursor-pointer block"
                      >
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2 group-hover:text-blue-600 transition-colors" />
                        <p className="text-sm font-medium text-gray-600">
                          Click or drag file here
                        </p>
                        <p className="text-xs text-gray-500 mt-1">(Drag and drop)</p>
                      </label>
                    </div>
                  ) : (
                    // File Preview
                    <div className="border border-green-300 bg-green-50 rounded-xl p-4 flex items-center justify-between transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div className="truncate">
                          <p className="text-sm font-semibold text-green-900 truncate">
                            {uploads[doc.id].name}
                          </p>
                          <p className="text-xs text-green-700">
                            {uploads[doc.id].size}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(doc.id)}
                        className="text-red-600 hover:bg-red-100 flex-shrink-0 ml-4"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* Lawyer's Note */}
        {requestData?.note && (
          <Alert className="bg-blue-50 border-blue-200 text-blue-900 shadow-md">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-900 font-bold">
              Note from {lawyerName}
            </AlertTitle>
            <AlertDescription className="pt-1">{requestData.note}</AlertDescription>
          </Alert>
        )}

        {/* Submit Button */}
        <div className="pt-4">
          <Button
            onClick={handleSubmit}
            disabled={!allRequiredUploaded || isSubmitting}
            className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-60"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                Submitting Files...
              </>
            ) : (
              "Submit Required Documents"
            )}
          </Button>
        </div>

        {!allRequiredUploaded && (
          <p className="text-sm text-center text-red-500 font-medium">
            Please upload all required documents to enable submission.
          </p>
        )}
      </div>
      
      {/* Sonner component for notifications */}
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
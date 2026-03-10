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
import { Toaster, toast } from "sonner"; // Import Sonner
import { format } from "date-fns"; // Import date-fns for formatting
import { apiFetch } from "@/lib/api";

// --- CONFIG ---
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
  const [completionNote, setCompletionNote] = useState("");
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
        const response = await apiFetch(`/requests/${token}`);
        if (!response.ok) {
          const errData = await response
            .json()
            .catch(() => ({ detail: "Unknown server error." }));
          throw new Error(errData.detail || "Link invalid or expired.");
        }
        const data = await response.json();

        if (data.status === "completed") {
          setIsSuccess(true);
          setCompletionNote("This upload request has already been completed.");
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

      const response = await apiFetch(`/requests/${token}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ detail: "Unknown upload error." }));
        throw new Error(errData.detail || "Upload failed.");
      }

      // Success!
      setIsSuccess(true);
      setCompletionNote("Your documents were uploaded successfully.");
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
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 shadow-lg">
          <CardContent className="p-8 flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              Loading request...
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg border-destructive/30">
          <CardHeader className="text-center">
            <AlertCircle className="w-14 h-14 text-destructive mx-auto mb-3" />
            <CardTitle className="text-2xl">Access Error</CardTitle>
            <CardDescription className="text-base">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg border-emerald-200">
          <CardHeader>
            <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto mb-3" />
            <CardTitle className="text-2xl">
              Documents Uploaded Successfully!
            </CardTitle>
            <CardDescription className="text-base mt-2 text-muted-foreground">
              Thank you! Your documents have been delivered and will be
              reviewed by your lawyer shortly.
            </CardDescription>
            {completionNote && (
              <AlertDescription className="text-base mt-4 text-muted-foreground">
                {completionNote}
              </AlertDescription>
            )}
          </CardHeader>
        </Card>
      </div>
    );
  }

  // --- MAIN RENDER ---
  const caseTitle = requestData?.case_title || "Case";
  const lawyerName = requestData?.personnel_names?.[0] || "Case Team";
  const firstClientName = requestData?.client_names?.[0] || "Client";
  const documents = requestData?.requested_documents || [];
  const deadline = requestData?.deadline;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Case Documents
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Please upload all required files for case{" "}
            <strong className="text-foreground">{caseTitle}</strong>.
          </p>
        </header>

        <Card className="shadow-md border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Client:</span>
              <span className="font-medium text-foreground">{firstClientName}</span>
            </div>
            <div className="flex justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Case:</span>
              <span className="font-medium text-foreground">{caseTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Assigned Lawyer:
              </span>
              <span className="font-medium text-foreground">{lawyerName}</span>
            </div>
            
            {/* NEW: Deadline Display */}
            {deadline && (
                 <div className="flex justify-between items-center border-t border-border/50 pt-3 mt-3 text-amber-700 font-semibold">
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

        <Card className="shadow-md border-border/60">
          <CardHeader>
            <CardTitle className="text-xl">
              Required Files ({documents.length})
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Please upload files in <strong>PDF, JPG, PNG, DOC/DOCX</strong> formats. Max file size: <strong>10 MB</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[52vh] overflow-y-auto pr-2">
              <div className="space-y-6 pb-1">
              {documents.map((doc) => (
                <div key={doc.id} className="border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-primary" />
                      <span className="font-semibold text-foreground">{doc.name}</span>
                    </div>
                    {uploads[doc.id] && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>

                  {!uploads[doc.id] ? (
                    // Dropzone
                    <div
                      onDrop={(e) => handleDrop(e, doc.id)}
                      onDragOver={handleDragOver}
                      className="border-2 border-dashed border-border rounded-xl p-6 text-center bg-muted/40 hover:border-primary/60 transition-colors cursor-pointer group"
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
                        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2 group-hover:text-primary transition-colors" />
                        <p className="text-sm font-medium text-foreground">
                          Click or drag file here
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">(Drag and drop)</p>
                      </label>
                    </div>
                  ) : (
                    // File Preview
                    <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 flex items-center justify-between transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-6 h-6 text-emerald-700 flex-shrink-0" />
                        <div className="truncate">
                          <p className="text-sm font-semibold text-emerald-900 truncate">
                            {uploads[doc.id].name}
                          </p>
                          <p className="text-xs text-emerald-700">
                            {uploads[doc.id].size}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(doc.id)}
                        className="text-destructive hover:bg-destructive/10 flex-shrink-0 ml-4"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lawyer's Note */}
        {requestData?.note && (
          <Alert className="bg-primary/5 border-primary/20 text-foreground shadow-sm">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertTitle className="font-semibold">
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
            className="w-full h-12 text-base font-semibold shadow-lg"
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
          <p className="text-sm text-center text-destructive font-medium">
            Please upload all required documents to enable submission.
          </p>
        )}
      </div>
      
      {/* Sonner component for notifications */}
      <Toaster richColors position="bottom-right" />
    </div>
  );
}

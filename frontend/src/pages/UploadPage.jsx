import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Camera, CheckCircle2, Clock, Download, FileText, Loader2, Lock } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

// The page a lead or client opens from the text link (tasks 1.7 and 1.10): upload what
// the firm asked for, or download what the firm sent. No login: the link
// itself is the key, so it shows only a first name and the documents asked for.
// Phone-first. Each file uploads on its own with a progress bar, so one bad file
// never loses the others.

const asDate = (iso) => new Date(iso && !iso.endsWith("Z") && !iso.includes("+") ? `${iso}Z` : iso);
const dayOf = (iso) => asDate(iso).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

function uploadOne(token, itemId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/public/file-requests/${token}/items/${itemId}/files`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === "string" ? data.detail : "The upload didn't go through. Try again."));
    };
    xhr.onerror = () => reject(new Error("No connection. Check your signal and try again."));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export default function UploadPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [uploads, setUploads] = useState({}); // itemId -> [{name, progress, done, error}]

  useEffect(() => {
    fetch(`${API_BASE_URL}/public/file-requests/${token}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "This link isn't valid.");
        setInfo(data);
      })
      .catch((err) => setLoadError(err.message));
  }, [token]);

  const addFiles = async (item, fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Date.now()}`;
      const update = (patch) => setUploads((prev) => ({
        ...prev,
        [item.id]: (prev[item.id] || []).map((u) => (u.key === key ? { ...u, ...patch } : u)),
      }));
      setUploads((prev) => ({ ...prev, [item.id]: [...(prev[item.id] || []), { key, name: file.name, progress: 0 }] }));
      if (file.size > info.max_file_mb * 1024 * 1024) {
        update({ error: `Over ${info.max_file_mb} MB. Try a smaller photo or a shorter PDF.` });
        continue;
      }
      try {
        await uploadOne(token, item.id, file, (p) => update({ progress: p }));
        update({ done: true, progress: 100 });
        setInfo((prev) => ({ ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, file_count: i.file_count + 1 } : i)) }));
      } catch (err) {
        update({ error: err.message });
      }
    }
  };

  const allReceived = info?.items?.length > 0 && info.items.every((i) => i.file_count > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-ink px-5 py-4 text-white">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-[13px] font-bold">DSS</span>
          <div className="leading-tight">
            <p className="font-semibold">{info?.firm_name || "Davis, Saperstein & Salomon"}</p>
            <p className="flex items-center gap-1 text-xs text-white/70"><Lock className="h-3 w-3" /> {info?.direction === "send" ? "Secure documents" : "Secure document upload"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-6">
        {!info && !loadError && (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Opening your request…</p>
        )}

        {loadError && <Notice icon={AlertCircle} title="This link doesn't work" text={`${loadError} If you need help, reply to our text message.`} />}

        {info && info.state === "expired" && (
          <Notice icon={Clock} title="This link has expired" text="For your security, upload links only work for a limited time. Reply to our text and we'll send you a new one." />
        )}
        {info && info.state === "revoked" && (
          <Notice icon={Lock} title="This link is no longer active" text="The firm turned this link off. Reply to our text if you still need to send documents." />
        )}

        {info && info.can_upload && info.direction === "send" && (
          <>
            <h1 className="text-2xl font-bold text-ink">{info.first_name ? `Hi ${info.first_name},` : "Hello,"}</h1>
            <p className="mt-2 text-[17px] leading-relaxed">{info.note || "Here are your documents."} Tap a document to open or save it.</p>
            <ul className="mt-6 space-y-3">
              {info.files.map((f) => (
                <li key={f.id}>
                  <a
                    href={`${API_BASE_URL}/public/file-requests/${token}/files/${f.id}`}
                    className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary"
                  >
                    <FileText className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-semibold">{f.name}</span>
                      <span className="block text-sm text-muted-foreground">{f.size_bytes > 1048576 ? `${(f.size_bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size_bytes / 1024))} KB`}</span>
                    </span>
                    <Download className="h-5 w-5 shrink-0 text-primary" aria-label="Download" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-muted-foreground">
              This link works until {dayOf(info.expires_at)}. Please save anything you want to keep.
            </p>
          </>
        )}

        {info && info.can_upload && info.direction !== "send" && (
          <>
            <h1 className="text-2xl font-bold text-ink">{info.first_name ? `Hi ${info.first_name},` : "Hello,"}</h1>
            <p className="mt-2 text-[17px] leading-relaxed">
              {info.note || "Please upload the documents below."} You can take a photo with your phone or choose a PDF.
            </p>

            {allReceived && (
              <div className="mt-5 flex gap-3 rounded-lg border border-success/40 bg-success/10 p-4" role="status">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <p>Thank you, we have everything we asked for. You can still add more pages until {dayOf(info.expires_at)}.</p>
              </div>
            )}

            <ol className="mt-6 space-y-4">
              {info.items.map((item) => (
                <UploadItem key={item.id} item={item} uploads={uploads[item.id] || []} onFiles={(files) => addFiles(item, files)} />
              ))}
            </ol>

            <p className="mt-8 text-sm text-muted-foreground">
              Photos and PDF files, up to {info.max_file_mb} MB each. This link works until {dayOf(info.expires_at)}.
              Your files go straight to the firm and aren't shared with anyone else.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function UploadItem({ item, uploads, onFiles }) {
  const inputRef = useRef(null);
  const received = item.file_count > 0;
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[17px] font-semibold">{item.name}</p>
          <p className={`mt-0.5 text-sm ${received ? "text-success" : "text-muted-foreground"}`}>
            {received ? `${item.file_count} ${item.file_count === 1 ? "file" : "files"} received` : "Not sent yet"}
          </p>
        </div>
        {received && <CheckCircle2 className="h-6 w-6 shrink-0 text-success" aria-hidden />}
      </div>

      {uploads.length > 0 && (
        <ul className="mt-3 space-y-2">
          {uploads.map((u) => (
            <li key={u.key} className="text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {u.done && <span className="text-success">Sent</span>}
                {!u.done && !u.error && <span className="tabular text-muted-foreground">{u.progress}%</span>}
              </div>
              {!u.done && !u.error && (
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${u.progress}%` }} />
                </div>
              )}
              {u.error && <p role="alert" className="mt-1 text-destructive">{u.error}</p>}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        aria-label={`Add a photo or PDF for ${item.name}`}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <Camera className="h-5 w-5" /> {received ? "Add more" : "Take a photo or choose a file"}
      </button>
    </li>
  );
}

function Notice({ icon: Icon, title, text }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-3 text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-[17px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

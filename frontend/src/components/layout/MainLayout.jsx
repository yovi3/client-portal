import { useState } from "react";

// Whether the sidebar shows icons only. Remembered in this browser.
const COLLAPSE_KEY = "dssc.sidebarCollapsed";
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } };
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import Header from "./Header";
import Sidebar from "./Sidebar";

// A navy top bar runs across the whole window and carries the firm mark. Below it,
// the sidebar stays put on the left and the page uses all the remaining width;
// only the page scrolls. On phones the sidebar opens as a drawer instead.
export default function MainLayout({ children }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* storage unavailable */ }
    return !c;
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleCollapsed}
        mobileMenuTrigger={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 text-white hover:bg-white/10 hover:text-white"
            aria-label="Open navigation menu"
            onClick={() => setSheetOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block shrink-0">
          <Sidebar collapsed={collapsed} />
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left" className="w-60 border-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar onNavigate={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

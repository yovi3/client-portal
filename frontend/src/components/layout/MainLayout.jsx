import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import Header from "./Header";
import Sidebar from "./Sidebar";

// The sidebar runs the full height of the window and stays put; only the page
// area to its right scrolls. On phones the sidebar opens as a drawer instead.
export default function MainLayout({ children }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          mobileMenuTrigger={
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9"
              aria-label="Open navigation menu"
              onClick={() => setSheetOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          }
        />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

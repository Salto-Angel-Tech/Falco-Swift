import { Navigate, Route, Routes } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EvaluatePage } from "@/pages/EvaluatePage";
import { JobsPage } from "@/pages/JobsPage";
import { LabelPage } from "@/pages/LabelPage";
import { ModelsPage } from "@/pages/ModelsPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { QuestionsPage } from "@/pages/QuestionsPage";
import { TrainPage } from "@/pages/TrainPage";

export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-background">
          <AppHeader />
          <main className="w-full max-w-[1600px] min-w-0 px-4 py-6 md:px-6">
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/questions" element={<QuestionsPage />} />
              <Route path="/label" element={<LabelPage />} />
              <Route path="/train" element={<TrainPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/evaluate" element={<EvaluatePage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:jobId" element={<JobsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" richColors={false} />
    </TooltipProvider>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  FolderGit2, 
  ShieldCheck, 
  LayoutGrid, 
  MessageSquare, 
  Activity,
  HardDrive,
  CheckCircle2,
  ChevronRight,
  ChevronLeft
} from "lucide-react";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);

  const handleNext = () => {
    if (step === 3 && selectedDir) {
      setIsScanning(true);
      setTimeout(() => {
        setIsScanning(false);
        setStep(4);
      }, 2000);
    } else {
      setStep(prev => prev + 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('oversight_onboarding_completed', 'true');
    setLocation("/");
  };

  const selectDirectory = () => {
    // Mocking a directory selection dialog
    setTimeout(() => {
      setSelectedDir("~/Developer");
    }, 500);
  };

  return (
    <div className="flex h-screen bg-[#ececec] overflow-hidden text-[13px] font-sans items-center justify-center p-4">
      {/* Mac Window Wrapper */}
      <div className="w-full max-w-2xl bg-white/90 backdrop-blur-3xl border border-black/10 rounded-xl shadow-2xl overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-500">
        
        {/* Titlebar */}
        <div className="h-[40px] titlebar-drag-region flex items-center justify-center relative border-b border-black/5 bg-white/50">
          <div className="absolute left-4 mac-window-controls flex items-center gap-2">
            <div className="mac-btn mac-btn-close opacity-50"></div>
            <div className="mac-btn mac-btn-minimize opacity-50"></div>
            <div className="mac-btn mac-btn-maximize opacity-50"></div>
          </div>
          <span className="font-semibold text-xs text-muted-foreground">Welcome to Oversight</span>
        </div>

        {/* Content Area */}
        <div className="p-10 flex-1 flex flex-col items-center justify-center min-h-[400px]">
          
          {step === 1 && (
            <div className="text-center max-w-md space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="w-20 h-20 bg-gradient-to-b from-primary/80 to-primary text-primary-foreground rounded-2xl mx-auto shadow-lg flex items-center justify-center border border-black/10">
                <LayoutGrid className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-3">Welcome to Oversight</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The professional, desktop-first cockpit for software engineers. <br/>
                  Gain high-signal visibility into your projects, manage code reviews efficiently, and track local repository health.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="w-full max-w-lg animate-in fade-in slide-in-from-right-8 duration-500">
              <h2 className="text-xl font-bold text-center mb-8">Capabilities</h2>
              
              <div className="space-y-4">
                <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="bg-primary/10 p-2.5 rounded-lg h-fit">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Project Overview</h3>
                    <p className="text-xs text-muted-foreground">A clear overview of all your local repositories. Monitor PR counts, issue queues, and build statuses effortlessly.</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="bg-primary/10 p-2.5 rounded-lg h-fit">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Code Review Workflow</h3>
                    <p className="text-xs text-muted-foreground">A dedicated inbox for PRs. Instantly identify required actions, blocked items, and performance metrics.</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="bg-primary/10 p-2.5 rounded-lg h-fit">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Targeted Activity</h3>
                    <p className="text-xs text-muted-foreground">Reduce notification noise. A focused stream for mentions, build failures, and approvals that impact your current work.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center max-w-md animate-in fade-in slide-in-from-right-8 duration-500 w-full">
              <div className="w-16 h-16 bg-secondary rounded-full mx-auto flex items-center justify-center mb-6">
                <HardDrive className="w-8 h-8 text-foreground/70" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">Select Workspace</h2>
              <p className="text-sm text-muted-foreground mb-8">
                Choose the root folder where your code lives. Oversight will automatically scan for Git repositories inside it.
              </p>
              
              <div className="bg-secondary/20 border border-border/60 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-2 text-xs font-medium text-chart-1 bg-chart-1/10 px-3 py-1.5 rounded-md w-fit mx-auto mb-4 border border-chart-1/20">
                  <ShieldCheck className="w-4 h-4" /> Local-First Analysis
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  We process data locally on your machine. Your source code never leaves your Mac. Zero telemetry, maximum privacy.
                </p>
                
                <button 
                  onClick={selectDirectory}
                  className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all ${
                    selectedDir 
                      ? 'bg-secondary text-foreground border border-border' 
                      : 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                  }`}
                >
                  {selectedDir ? "Change Directory..." : "Choose Directory..."}
                </button>

                {selectedDir && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm font-mono text-foreground bg-white border border-border px-3 py-2 rounded-md shadow-sm">
                    <FolderGit2 className="w-4 h-4 text-primary" />
                    {selectedDir}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center max-w-md animate-in fade-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-chart-1/10 rounded-full mx-auto flex items-center justify-center mb-6 border border-chart-1/20">
                <CheckCircle2 className="w-10 h-10 text-chart-1" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">You're All Set!</h2>
              <p className="text-sm text-muted-foreground mb-8">
                Oversight found 6 repositories in <strong>{selectedDir}</strong>. <br/>
                We'll continue monitoring them locally in the background.
              </p>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-5 border-t border-black/5 bg-secondary/30 flex justify-between items-center relative">
          {/* Progress Dots */}
          <div className="absolute left-1/2 -translate-x-1/2 flex gap-1.5">
            {[1, 2, 3, 4].map(i => (
              <div 
                key={i} 
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-border'
                }`} 
              />
            ))}
          </div>

          {step > 1 && step < 4 ? (
            <button 
              onClick={() => setStep(step - 1)}
              disabled={isScanning}
              className="px-4 py-2 rounded-md text-sm font-medium hover:bg-black/5 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}

          {step < 4 ? (
            <button 
              onClick={handleNext}
              disabled={isScanning || (step === 3 && !selectedDir)}
              className="px-5 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              {isScanning ? "Scanning..." : "Continue"} {!isScanning && <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <button 
              onClick={handleComplete}
              className="px-6 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2 ml-auto"
            >
              Launch Oversight
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
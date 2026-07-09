import { Settings, SlidersHorizontal, User, Scissors, Smartphone, Check } from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

export function AdvancedSettings() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);

  const silenceOptions = [
    { value: '0.2', label: '0.2s (Aggressive)' },
    { value: '0.4', label: '0.4s (Normal)' },
    { value: '0.8', label: '0.8s (Relaxed)' },
    { value: '1.5', label: '1.5s (Minimal)' },
  ];

  const ToggleItem = ({ 
    active, 
    onClick, 
    icon: Icon, 
    label, 
    desc 
  }: { 
    active: boolean, 
    onClick: () => void, 
    icon: any, 
    label: string, 
    desc: string 
  }) => (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
        active 
          ? "bg-primary/10 border-primary/30" 
          : "bg-black/20 border-white/5 hover:bg-black/40 hover:border-white/10"
      )}
    >
      <div className={cn(
        "grid h-8 w-8 place-items-center rounded-full shrink-0 transition-colors",
        active ? "bg-primary/20 text-primary" : "bg-white/5 text-gray-400"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-semibold mb-0.5", active ? "text-primary" : "text-gray-200")}>{label}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{desc}</p>
      </div>
      {active && <Check className="h-4 w-4 text-primary shrink-0" />}
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Settings className="h-4 w-4 text-blue-400" />
          Smart Dead Air Settings
        </h2>
      </div>

      <div className="space-y-4">
        {/* Silence Threshold */}
        <div>
          <label className="text-xs font-medium text-gray-400 block mb-2 flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3" /> Silence Threshold
          </label>
          <div className="grid grid-cols-2 gap-2">
            {silenceOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSettings({ minSilence: opt.value })}
                className={cn(
                  "py-2 px-3 rounded-md text-[11px] font-medium transition-all border",
                  settings.minSilence === opt.value
                    ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                    : "bg-[#1A1A1A] text-gray-400 border-white/5 hover:bg-white/5 hover:text-gray-200"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Padding */}
        <div>
          <label className="text-xs font-medium text-gray-400 block mb-2">Padding (sec)</label>
          <div className="flex items-center gap-3 bg-[#1A1A1A] p-2 rounded-lg border border-white/5">
            <input 
              type="range" 
              min="0.0" 
              max="0.3" 
              step="0.02" 
              value={settings.pad} 
              onChange={(e) => setSettings({ pad: e.target.value })}
              className="flex-1 accent-primary" 
            />
            <span className="text-xs font-mono text-gray-300 w-8">{settings.pad}s</span>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <ToggleItem
            active={settings.removeFillers}
            onClick={() => setSettings({ removeFillers: !settings.removeFillers })}
            icon={Scissors}
            label="Remove Filler Words"
            desc="AI cleans up 'uh', 'um', 'เอ่อ', 'อ่า' from transcript"
          />
          <ToggleItem
            active={settings.detectSpeakers}
            onClick={() => setSettings({ detectSpeakers: !settings.detectSpeakers })}
            icon={User}
            label="Speaker Detection"
            desc="Label Speaker A, B, C automatically"
          />
          <ToggleItem
            active={settings.generateShorts}
            onClick={() => setSettings({ generateShorts: !settings.generateShorts })}
            icon={Smartphone}
            label="Auto Shorts Generator"
            desc="Export a 9:16 Center Crop version"
          />
        </div>
      </div>
    </div>
  );
}

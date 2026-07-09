import React from 'react';

export default function SkillsPage() {
  return (
    <div className="flex-1 h-screen w-full overflow-hidden bg-[#0f172a]">
      <iframe 
        src="/skill-editor/index.html" 
        className="w-full h-full border-none"
        title="Claude Skill Editor"
      />
    </div>
  );
}

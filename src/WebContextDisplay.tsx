import React from 'react';
import { Globe } from 'lucide-react';

interface WebContextItem {
  type: 'read' | 'watch' | 'service' | 'info';
  title: string;
  snippet: string;
  url: string;
}

interface WebContextDisplayProps {
  webContext: WebContextItem[] | null;
  isLoading: boolean;
}

const WebContextDisplay: React.FC<WebContextDisplayProps> = ({ webContext, isLoading }) => {
  if (isLoading) {
    return (
      <div className="mt-8 pt-6 border-t border-slate-700/50">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="space-y-3">
          <div className="h-12 bg-slate-800/50 rounded-lg animate-pulse"></div>
          <div className="h-12 bg-slate-800/50 rounded-lg animate-pulse"></div>
          <div className="h-12 bg-slate-800/50 rounded-lg animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!webContext || webContext.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 pt-6 border-t border-slate-700/50">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Web Agent Links</h3>
      <div className="space-y-3">
        {webContext.map((item, index) => (
          <a
            key={index}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-slate-800/50 rounded-lg group hover:bg-slate-700/50 transition-colors"
          >
            <h4 className="font-semibold text-slate-200 group-hover:text-white truncate text-sm">
              {item.title}
            </h4>
            <div className="flex items-center gap-2 mt-1">
                <Globe size={12} className="text-slate-500 flex-shrink-0" />
                <p className="text-xs text-slate-400 truncate">{item.snippet}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default WebContextDisplay;
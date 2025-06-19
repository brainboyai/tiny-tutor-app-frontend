import React from 'react';
import { BookOpen, Youtube, ShoppingCart, Info } from 'lucide-react';

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

const typeInfo = {
  read: { icon: BookOpen, label: 'Read', color: 'text-sky-400' },
  watch: { icon: Youtube, label: 'Watch', color: 'text-red-500' },
  service: { icon: ShoppingCart, label: 'Service', color: 'text-emerald-400' },
  info: { icon: Info, label: 'Info', color: 'text-blue-400' },
};

const WebContextDisplay: React.FC<WebContextDisplayProps> = ({ webContext, isLoading }) => {
  if (isLoading) {
    return (
      <div className="mt-8 pt-6 border-t border-slate-700/50 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-28 bg-slate-800 rounded-lg"></div>
          <div className="h-28 bg-slate-800 rounded-lg"></div>
          <div className="h-28 bg-slate-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!webContext || webContext.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 pt-6 border-t border-slate-700/50">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Web Agent Results</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {webContext.map((item, index) => {
          const Icon = typeInfo[item.type]?.icon || Info;
          const color = typeInfo[item.type]?.color || 'text-sky-400';
          return (
            <a
              key={index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 hover:ring-2 hover:ring-slate-600 transition-all group"
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-6 h-6 ${color} flex-shrink-0`} />
                <h4 className="font-semibold text-slate-200 truncate group-hover:text-white">{item.title}</h4>
              </div>
              <p className="text-sm text-slate-400 line-clamp-2 mt-2">{item.snippet}</p>
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default WebContextDisplay;
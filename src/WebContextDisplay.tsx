import React from 'react';
import { BookOpen, Youtube, ShoppingCart, Info, ExternalLink } from 'lucide-react';

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
  service: { icon: ShoppingCart, label: 'Shop', color: 'text-emerald-400' },
  info: { icon: Info, label: 'More Info', color: 'text-amber-400' },
};

const WebContextDisplay: React.FC<WebContextDisplayProps> = ({ webContext, isLoading }) => {
  if (isLoading) {
    return (
      <div className="mt-8 pt-6 border-t border-[--border-color] animate-pulse">
        <div className="h-4 bg-[--hover-bg-color] rounded w-1/3 mb-4"></div>
        <div className="space-y-4">
            <div className="h-20 bg-[--background-secondary] rounded-lg"></div>
            <div className="h-20 bg-[--background-secondary] rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!webContext || webContext.length === 0) {
    return null; // Don't render anything if there's no context
  }

  return (
    <div className="mt-8 pt-6 border-t border-[--border-color]">
      <h3 className="text-lg font-semibold text-[--text-primary] mb-4">Related Web Links</h3>
      <div className="space-y-4">
        {webContext.map((item, index) => {
          const Icon = typeInfo[item.type]?.icon || Info;
          const color = typeInfo[item.type]?.color || 'text-sky-400';
          return (
            <a
              key={index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-[--background-secondary] rounded-lg hover:bg-[--hover-bg-color] hover:border-[--accent-primary] border border-transparent transition-colors group"
            >
              <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <h4 className="font-semibold text-[--text-primary] group-hover:text-[--accent-primary]">{item.title}</h4>
                    </div>
                    <p className="text-sm text-[--text-tertiary] line-clamp-2">{item.snippet}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[--text-tertiary] flex-shrink-0 ml-4 group-hover:text-[--accent-primary]"/>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default WebContextDisplay;

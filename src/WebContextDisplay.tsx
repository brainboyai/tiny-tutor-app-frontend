import React from 'react';
import LinkPreviewCard from './LinkPreviewCard.tsx';

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="h-[10rem] bg-slate-800/50 rounded-lg animate-pulse"></div>
          <div className="h-[10rem] bg-slate-800/50 rounded-lg animate-pulse"></div>
          <div className="h-[10rem] bg-slate-800/50 rounded-lg animate-pulse"></div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {webContext.map((item, index) => (
          <LinkPreviewCard
            key={index}
            url={item.url}
          />
        ))}
      </div>
    </div>
  );
};

export default WebContextDisplay;
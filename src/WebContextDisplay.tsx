// src/WebContextDisplay.tsx

import React from 'react';
import LinkPreviewCard from './LinkPreviewCard.tsx'; // Your existing component
import HotelCard from './HotelCard.tsx'; // The new component we just created

// UPDATED: The interface now includes all possible types and the optional 'image' property
interface WebContextItem {
  type: 'read' | 'watch' | 'service' | 'info' | 'Hotel' | 'News' | 'Video' | 'Event' | 'Finance' | 'Knowledge' | 'Web Link';
  title: string;
  snippet: string;
  url: string;
  image?: string;
}

interface WebContextDisplayProps {
  webContext: WebContextItem[] | null;
  isLoading: boolean;
}

const WebContextDisplay: React.FC<WebContextDisplayProps> = ({ webContext, isLoading }) => {
  if (isLoading) {
    // Your existing loading skeleton UI is preserved
    return (
      <div className="mt-8 pt-6 border-t border-slate-700/50">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-48 bg-slate-800/50 rounded-lg animate-pulse"></div>
          <div className="h-48 bg-slate-800/50 rounded-lg animate-pulse"></div>
          <div className="h-48 bg-slate-800/50 rounded-lg animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!webContext || webContext.length === 0) {
    return <div className="text-center p-10 text-slate-500">No results found.</div>;
  }

  return (
    <div className="mt-8 pt-6 border-t border-slate-700/50">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Web Agent Results</h3>
      {/* This now uses the new results-grid class for styling */}
      <div className="results-grid">
        {webContext.map((item, index) => {
          // This "switch" statement is the UI router.
          // It checks the 'type' of the result and renders the correct component.
          switch (item.type) {
            case 'Hotel':
              return (
                <HotelCard 
                  key={index} 
                  title={item.title} 
                  url={item.url} 
                  imageUrl={item.image} 
                  snippet={item.snippet} 
                />
              );
            
            // You can add more custom cards here later, e.g., for 'Video' or 'News'
            // case 'Video':
            //   return <VideoCard key={index} item={item} />;

            default:
              // For any other type, it will use your existing LinkPreviewCard
              return (
                <LinkPreviewCard
                  key={index}
                  title={item.title}
                  snippet={item.snippet}
                  url={item.url}
                />
              );
          }
        })}
      </div>
    </div>
  );
};

export default WebContextDisplay;
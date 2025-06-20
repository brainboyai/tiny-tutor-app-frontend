import React from 'react';
import { Globe, Youtube } from 'lucide-react';

interface LinkPreviewCardProps {
  title: string;
  snippet: string;
  url: string;
}

const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ title, snippet, url }) => {
  // Helper function to get the domain name from a URL
  const getDomainName = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (e) {
      // Return a snippet of the URL if parsing fails
      return url.split('/')[2] || url;
    }
  };
  
  const domainName = getDomainName(url);
  const isYoutubeLink = domainName.includes('youtube.com');

  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="block bg-slate-800/50 rounded-lg group hover:ring-2 hover:ring-slate-600 transition-all p-4 flex flex-col justify-between min-h-[120px]"
    >
      {/* Text Content */}
      <div>
        <div className="flex items-start gap-3 mb-2">
           {/* Icon Display */}
          <div className="flex-shrink-0 mt-1">
            {isYoutubeLink ? <Youtube className="w-5 h-5 text-slate-500" /> : <Globe className="w-5 h-5 text-slate-500" />}
          </div>
          {/* Title */}
          <h4 className="font-semibold text-slate-200 group-hover:text-white line-clamp-2 leading-tight">
            {title}
          </h4>
        </div>

        {/* Snippet */}
        <p className="text-xs text-slate-400 line-clamp-2">
          {snippet}
        </p>
      </div>

      {/* Domain Name */}
      <p className="text-xs text-slate-500 truncate mt-3">
        {domainName}
      </p>
    </a>
  );
};

export default LinkPreviewCard;
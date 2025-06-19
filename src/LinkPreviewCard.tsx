import React, { useState, useEffect } from 'react';
import { Globe, Youtube } from 'lucide-react';

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

interface LinkPreviewCardProps {
  title: string;
  snippet: string;
  url: string;
}

interface PreviewData {
  title?: string;
  description?: string;
  image?: string;
}

const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ title, snippet, url }) => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getDomainName = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname.replace('www.', '');
    } catch (e) {
      return urlStr;
    }
  };

  const domainName = getDomainName(url);
  const isYoutubeLink = domainName.includes('youtube.com');

  useEffect(() => {
    const fetchMetadata = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/fetch_link_metadata?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error('Failed to fetch metadata');
        const data = await response.json();
        setPreviewData(data);
      } catch (error) {
        console.error("Error fetching link preview for:", url, error);
        setPreviewData({}); // Fallback to empty object on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [url]);

  if (isLoading) {
    return <div className="bg-slate-800/50 rounded-lg animate-pulse h-48"></div>;
  }
  
  // Use fetched metadata but fallback to original props from the search
  const displayTitle = previewData?.title || title;
  const displayDescription = previewData?.description || snippet;
  const displayImage = previewData?.image;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block bg-slate-800/50 rounded-lg group hover:ring-2 hover:ring-slate-600 transition-all h-48 flex flex-col justify-between">
      <div className="p-3 flex-grow flex flex-col justify-between">
        <h4 className="font-semibold text-slate-200 group-hover:text-white line-clamp-3 leading-tight text-sm">
          {displayTitle}
        </h4>
        <div className="flex items-center gap-2 mt-1">
          {displayImage ? (
            <img src={displayImage} alt="" className="w-4 h-4 object-cover rounded-sm" />
          ) : (
            <Globe size={12} className="text-slate-500" />
          )}
          <p className="text-xs text-slate-500 truncate">{domainName}</p>
        </div>
      </div>
      {displayImage && (
        <div className="w-full h-24 flex-shrink-0">
          <img src={displayImage} alt={displayTitle} className="w-full h-full object-cover" />
        </div>
      )}
    </a>
  );
};

export default LinkPreviewCard;
import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

interface LinkPreviewCardProps {
  url: string;
}

interface PreviewData {
  title?: string;
  description?: string;
  image?: string;
}

const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ url }) => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Function to extract the domain name from a URL
  const getDomainName = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (e) {
      return url;
    }
  };
  
  const domainName = getDomainName(url);

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
        setPreviewData({}); // Set to empty object on error to stop loading
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [url]);

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 animate-pulse h-[10rem]">
        <div className="h-full bg-slate-700/50 rounded-md"></div>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block bg-slate-800/50 rounded-lg overflow-hidden group hover:ring-2 hover:ring-slate-600 transition-all h-[10rem] flex flex-col">
      <div className="flex-grow p-4 flex flex-col justify-between">
        <div>
          <h4 className="font-semibold text-slate-200 group-hover:text-white line-clamp-2 leading-tight">
            {previewData?.title || domainName}
          </h4>
          {previewData?.description && (
            <p className="text-xs text-slate-400 line-clamp-2 mt-1">
              {previewData.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Globe size={12} className="text-slate-500" />
          <p className="text-xs text-slate-500 truncate">{domainName}</p>
        </div>
      </div>
      {previewData?.image && (
        <div className="w-1/3 h-full flex-shrink-0">
          <img src={previewData.image} alt="preview" className="w-full h-full object-cover" />
        </div>
      )}
    </a>
  );
};

export default LinkPreviewCard;
import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, BookOpen, Youtube, ShoppingCart, Info } from 'lucide-react';

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

interface LinkPreviewCardProps {
  type: 'read' | 'watch' | 'service' | 'info';
  title: string;
  url: string;
}

interface PreviewData {
  title?: string;
  description?: string;
  image?: string;
}

const typeInfo = {
  read: { icon: BookOpen, color: 'text-sky-400' },
  watch: { icon: Youtube, color: 'text-red-500' },
  service: { icon: ShoppingCart, color: 'text-emerald-400' },
  info: { icon: Info, color: 'text-blue-400' },
};

const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ type, title, url }) => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetadata = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/fetch_link_metadata?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
          throw new Error('Failed to fetch metadata');
        }
        const data = await response.json();
        setPreviewData(data);
      } catch (error) {
        console.error("Error fetching link preview:", error);
        setPreviewData({ title }); // Fallback to basic info on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [url, title]);

  const Icon = typeInfo[type]?.icon || Info;
  const color = typeInfo[type]?.color || 'text-sky-400';

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 animate-pulse">
        <div className="h-24 bg-slate-700/50 rounded-md mb-3"></div>
        <div className="h-4 bg-slate-700/50 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-slate-700/50 rounded w-full"></div>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block bg-slate-800/50 rounded-lg overflow-hidden group hover:ring-2 hover:ring-slate-600 transition-all">
      <div className="h-24 bg-slate-900 flex items-center justify-center">
        {previewData?.image ? (
          <img src={previewData.image} alt={previewData.title || title} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-10 h-10 text-slate-600" />
        )}
      </div>
      <div className="p-4">
        <h4 className="font-semibold text-slate-200 truncate group-hover:text-white">{previewData?.title || title}</h4>
        <p className="text-xs text-slate-400 truncate mt-1">{previewData?.description || url}</p>
      </div>
    </a>
  );
};

export default LinkPreviewCard;
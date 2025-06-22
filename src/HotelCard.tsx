// src/HotelCard.tsx

import React from 'react';

// Define the properties (props) that this component will accept
interface HotelCardProps {
  title: string;
  url: string;
  imageUrl?: string;
  snippet: string;
}

const HotelCard: React.FC<HotelCardProps> = ({ title, url, imageUrl, snippet }) => {
  return (
    // The entire card is a clickable link that opens in a new tab
    <a href={url} className="result-card" target="_blank" rel="noopener noreferrer">

      {/* The Image Container */}
      <div className="card-image-container">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="card-image" />
        ) : (
          // You can have a placeholder here if no image is available
          <div className="card-image-placeholder"></div>
        )}
      </div>

      {/* The Content Container */}
      <div className="card-content">
        <h3 className="card-title">{title}</h3>
        <p className="card-snippet">{snippet}</p>
      </div>
      
    </a>
  );
};

export default HotelCard;
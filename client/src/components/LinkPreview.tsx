import React, { useState, useEffect } from 'react';
import { ApiService } from '../services/api';

interface LinkPreviewProps {
  url: string;
  previewData?: any;
  onPreviewGenerated?: (data: any) => void;
}

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  type?: string;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({
  url,
  previewData,
  onPreviewGenerated
}) => {
  const [data, setData] = useState<LinkPreviewData | null>(previewData || null);
  const [loading, setLoading] = useState<boolean>(!previewData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!previewData && url) {
      fetchPreview();
    }
  }, [url, previewData]);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await ApiService.getLinkPreview(url);
      if (response && response.preview) {
        setData(response.preview);
        onPreviewGenerated?.(response.preview);
      } else {
        setError('Unable to generate preview');
      }
    } catch (err: any) {
      console.error('[LinkPreview] Fetch error:', err);
      setError('Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="link-preview-preview loading">
        <div className="link-preview-placeholder">
          <div className="link-preview-icon">🔗</div>
          <div className="link-preview-text">Loading preview...</div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="link-preview-error">
        <div className="link-preview-icon">⚠️</div>
        <div className="link-preview-text">{error}</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview-container"
      onClick={(e) => {
        // Track link click analytics here if needed
        console.log('[LinkPreview] Clicked:', data.url);
      }}
    >
      <div className="link-preview-card">
        {/* Favicon */}
        {data.faviconUrl && (
          <img
            src={data.faviconUrl}
            alt="Favicon"
            className="link-preview-favicon"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}

        {/* Image */}
        {data.imageUrl && (
          <img
            src={data.imageUrl}
            alt={data.title || 'Preview'}
            className="link-preview-image"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}

        {/* Content */}
        <div className="link-preview-content">
          <div className="link-preview-site">
            {data.siteName || new URL(data.url).hostname}
          </div>

          {data.title && (
            <div className="link-preview-title">
              {data.title}
            </div>
          )}

          {data.description && (
            <div className="link-preview-description">
              {data.description}
            </div>
          )}
        </div>
      </div>
    </a>
  );
};
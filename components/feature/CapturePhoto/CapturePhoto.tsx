
'use client';


import React, { useState, useRef, useEffect, RefObject, useCallback, JSX } from 'react';
import { Camera, X, RotateCcw, Check, AlertCircle } from 'lucide-react';

// Type definitions
type PermissionState = 'granted' | 'denied' | 'prompt';
type FacingMode = 'user' | 'environment';

interface CapturePhotoProps {
  trigger: React.ReactNode;
  imageRef: RefObject<HTMLImageElement>;
}

interface CameraConstraints {
  video: MediaTrackConstraints;
  audio: false;
}

interface CameraError extends Error {
  name: 'NotAllowedError' | 'NotFoundError' | 'NotReadableError' | 'OverconstrainedError' | string;
}

// Global MediaStream Instance (similar to reference code)
let globalStream: MediaStream | undefined = undefined;

const stopExistingCameraStreams = (): void => {
  if (globalStream) {
    globalStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  }
  globalStream = undefined;
};

const CapturePhoto: React.FC<CapturePhotoProps> = ({ trigger, imageRef }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyCalledRef = useRef<boolean>(false);

  // Check camera permission on mount
  useEffect(() => {
    checkCameraPermission();
  }, []);

  // Clean up stream when component unmounts
  useEffect(() => {
    return () => {
      stopExistingCameraStreams();
    };
  }, []);

  const checkCameraPermission = async (): Promise<void> => {
    try {
      if (navigator.permissions) {
        const result: PermissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setPermission(result.state as PermissionState);
        
        result.onchange = () => {
          setPermission(result.state as PermissionState);
        };
      }
    } catch (err) {
      console.log('Permission API not supported');
    }
  };

  const informCameraReady = useCallback((): void => {
    if (readyCalledRef.current) return;
    readyCalledRef.current = true;
    setIsCameraReady(true);
    setIsLoading(false);
    console.log('Camera is ready');
  }, []);

  const startCamera = useCallback(async (constraints: MediaTrackConstraints): Promise<void> => {
    // Check if the browser supports the MediaDevices API
    const isSupported = "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices;
    if (!isSupported) throw new Error("Camera not supported on this device");

    // Cleanup if already active
    stopExistingCameraStreams();

    // Start the camera and return the stream
    globalStream = await navigator.mediaDevices.getUserMedia({
      video: constraints,
    });

    if (videoRef.current) {
      // Reset ready state
      readyCalledRef.current = false;
      setIsCameraReady(false);

      // Set up event listeners before setting srcObject
      videoRef.current.onplaying = informCameraReady;
      videoRef.current.oncanplay = informCameraReady;
      
      // Set the stream
      videoRef.current.srcObject = globalStream;
      
      // Ensure video plays
      try {
        await videoRef.current.play();
      } catch (playError) {
        console.log('Video play failed, trying again...', playError);
        // Sometimes we need to retry
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play().catch(console.error);
          }
        }, 100);
      }
    }
  }, [informCameraReady]);

  const requestCameraAccess = async (): Promise<void> => {
    setIsLoading(true);
    setError('');
    setIsCameraReady(false);
    
    try {
      const constraints: MediaTrackConstraints = {
        facingMode: facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };

      await startCamera(constraints);
      setPermission('granted');
    } catch (err) {
      const cameraError = err as CameraError;
      console.error('Camera access error:', cameraError);
      
      if (cameraError.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permission and try again.');
        setPermission('denied');
      } else if (cameraError.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else if (cameraError.name === 'NotReadableError') {
        setError('Camera is already in use by another application.');
      } else if (cameraError.name === 'OverconstrainedError') {
        setError('Camera constraints cannot be satisfied.');
      } else {
        setError('Failed to access camera. Please try again.');
      }
      setIsLoading(false);
    }
  };

  const stopCamera = (): void => {
    stopExistingCameraStreams();
    setIsCameraReady(false);
    readyCalledRef.current = false;
  };

  const handleOpen = async (): Promise<void> => {
    setIsOpen(true);
    setCapturedImage(null);
    setError('');
    
    if (permission === 'granted' || permission === 'prompt') {
      await requestCameraAccess();
    }
  };

  const handleClose = (): void => {
    setIsOpen(false);
    stopCamera();
    setCapturedImage(null);
    setError('');
    setIsLoading(false);
  };

  const switchCamera = async (): Promise<void> => {
    const newFacingMode: FacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    if (globalStream) {
      setIsLoading(true);
      setIsCameraReady(false);
      
      try {
        const constraints: MediaTrackConstraints = {
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };

        await startCamera(constraints);
      } catch (err) {
        const cameraError = err as CameraError;
        console.error('Failed to switch camera:', cameraError);
        setError('Failed to switch camera. Using default camera.');
        // Fallback to original camera
        setFacingMode(facingMode);
        await requestCameraAccess();
      }
    }
  };

  const capturePhoto = useCallback((): void => {
    if (!videoRef.current || !canvasRef.current || !isCameraReady) {
      console.log('Video not ready for capture');
      return;
    }

    const video: HTMLVideoElement = videoRef.current;
    const canvas: HTMLCanvasElement = canvasRef.current;
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');

    if (!context) {
      setError('Canvas context not supported');
      return;
    }

    // Check if video has dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('Video dimensions not available');
      setError('Video not ready. Please wait a moment and try again.');
      return;
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    console.log('Capturing photo:', { width: video.videoWidth, height: video.videoHeight });

    // Handle mirroring for front camera (like in reference code)
    const isFrontCamera = facingMode === 'user';
    if (isFrontCamera) {
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, -1 * canvas.width, canvas.height);
    } else {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Convert canvas to data URL
    const imageDataUrl: string = canvas.toDataURL('image/jpeg', 0.8);
    
    if (imageDataUrl && imageDataUrl !== 'data:,') {
      setCapturedImage(imageDataUrl);
      console.log('Photo captured successfully');
    } else {
      setError('Failed to capture photo. Please try again.');
    }
  }, [isCameraReady, facingMode]);

  const confirmPhoto = (): void => {
    if (capturedImage && imageRef?.current) {
      imageRef.current.src = capturedImage;
      handleClose();
    }
  };

  const retakePhoto = (): void => {
    setCapturedImage(null);
  };

  const handleTriggerClick = (): void => {
    handleOpen();
  };

  const handleCloseClick = (): void => {
    handleClose();
  };

  const handleRetryClick = (): void => {
    requestCameraAccess();
  };

  const handleSwitchCameraClick = (): void => {
    switchCamera();
  };

  const handleCaptureClick = (): void => {
    capturePhoto();
  };

  const handleRetakeClick = (): void => {
    retakePhoto();
  };

  const handleConfirmClick = (): void => {
    confirmPhoto();
  };

  const renderCameraView = (): JSX.Element => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          {permission === 'denied' && (
            <p className="text-sm text-gray-600 mb-4">
              To use the camera, please:
              <br />1. Click the camera icon in your browser's address bar
              <br />2. Allow camera access
              <br />3. Refresh the page
            </p>
          )}
          <button
            onClick={handleRetryClick}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            type="button"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (capturedImage) {
      return (
        <div className="relative h-full flex flex-col">
          <img
            src={capturedImage}
            alt="Captured"
            className="flex-1 object-contain bg-black"
          />
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
            <button
              onClick={handleRetakeClick}
              className="p-3 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors"
              type="button"
              aria-label="Retake photo"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
            <button
              onClick={handleConfirmClick}
              className="p-3 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
              type="button"
              aria-label="Confirm photo"
            >
              <Check className="w-6 h-6" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover bg-black border"
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Loading overlay */}
        {(isLoading || !isCameraReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <p>Initializing camera...</p>
            </div>
          </div>
        )}
        
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
          <button
            onClick={handleSwitchCameraClick}
            className="p-3 bg-gray-600 bg-opacity-80 text-white rounded-full hover:bg-opacity-100 transition-all"
            type="button"
            aria-label="Switch camera"
            disabled={!isCameraReady}
          >
            <RotateCcw className="w-6 h-6" />
          </button>
          <button
            onClick={handleCaptureClick}
            className={`p-4 bg-white bg-opacity-80 text-gray-800 rounded-full hover:bg-opacity-100 transition-all border-4 border-white ${
              !isCameraReady ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            type="button"
            aria-label="Capture photo"
            disabled={!isCameraReady}
          >
            <Camera className="w-8 h-8" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Trigger Element */}
      <div onClick={handleTriggerClick} className="cursor-pointer" role="button" tabIndex={0}>
        {trigger}
      </div>

      {/* Camera Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl h-full max-h-[600px] bg-white rounded-lg overflow-hidden">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-white bg-opacity-90 p-4 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-black">Take Photo</h2>
              <button
                onClick={handleCloseClick}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                type="button"
                aria-label="Close camera"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera Content */}
            <div className="pt-16 h-full">
              {renderCameraView()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CapturePhoto;
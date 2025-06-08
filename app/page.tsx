'use client';

import React from 'react';
import CapturePhoto from '@/components/feature/CapturePhoto/CapturePhoto';
import { useRef } from 'react';

const Home: React.FC = () => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  return (
    <main className='flex flex-col h-screen w-full justify-center items-center gap-5'>
      <CapturePhoto trigger={<button className='px-5 py-2 border rounded-lg'>Take Photo</button>} imageRef={imageRef} />

        <img
          ref={imageRef}
          alt='Captured'
          className='w-[500px] h-[500px] border'
        />
    </main>
  );
};

export default Home;

import { useState, useEffect, useCallback } from 'react';

const MOBILE_BP  = 768;
const TABLET_BP  = 1024;

/**
 * 偵測裝置類型的 Hook — 支援 SSR 安全 + resize 自動更新
 *
 * @returns {{ isMobile: boolean, isTablet: boolean, isDesktop: boolean, width: number }}
 */
export function useResponsive() {
  const getWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [width, setWidth] = useState(getWidth);

  useEffect(() => {
    let raf;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return {
    isMobile:  width <= MOBILE_BP,
    isTablet:  width > MOBILE_BP && width <= TABLET_BP,
    isDesktop: width > TABLET_BP,
    width,
  };
}

/** 簡化版：只回傳 isMobile boolean */
export function useIsMobile() {
  const { isMobile } = useResponsive();
  return isMobile;
}

export default useIsMobile;

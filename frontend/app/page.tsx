"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";

// --- Swiper Imports ---
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Mousewheel } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/free-mode';
import "react-day-picker/dist/style.css";

// --- Configuration ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const DEFAULT_SITES = ["theguardian.com", "bbc.com", "aljazeera.com"];

type Screenshot = {
  id: number;
  url: string;
  captured_at: string;
  cloudinary_url: string | null;
  job_status: "ok" | "failed";
  device: "desktop" | "mobile";
};

// --- Helpers ---
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateDetail(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
}

function optimizedImage(url: string, width = 600) {
  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width}/`);
}

export default function Home() {
  const [date, setDate] = useState<Date>(new Date());
  const [activeDates, setActiveDates] = useState<Date[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleUrls, setVisibleUrls] = useState<string[]>(DEFAULT_SITES);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile">("desktop");

  // --- Modal State ---
  const [selectedShot, setSelectedShot] = useState<Screenshot | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // --- Versus Mode State ---
  const [isVersusOpen, setIsVersusOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const [mobileActiveSide, setMobileActiveSide] = useState<"left" | "right">("left");
  const [leftSite, setLeftSite] = useState<string>("");
  const [leftShot, setLeftShot] = useState<Screenshot | null>(null);
  const [rightSite, setRightSite] = useState<string>("");
  const [rightShot, setRightShot] = useState<Screenshot | null>(null);
  const [showUrls, setShowUrls] = useState(false);

  const calendarRef = useRef<HTMLDivElement>(null);

  // 1. Load Active Dates
  useEffect(() => {
    async function loadDates() {
      const { data, error } = await supabase.rpc("get_screenshot_days");
      if (data && !error) {
        const dates = data.map((d: any) => new Date(d.date || d));
        setActiveDates(dates);
      }
    }
    loadDates();
  }, []);

  // 2. Load Screenshots
  useEffect(() => {
    async function load() {
      setLoading(true);
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const { data } = await supabase
        .from("screenshots")
        .select("*")
        .eq("job_status", "ok")
        .eq("device", deviceMode)
        .gte("captured_at", start.toISOString())
        .lt("captured_at", end.toISOString())
        .order("url")
        .order("captured_at");

      if (data) {
        setScreenshots(data);
        setLeftSite("");
        setRightSite("");
        setLeftShot(null);
        setRightShot(null);
      }
      setLoading(false);
    }
    load();
  }, [date, deviceMode]);

  // 3. DIALOG SYNC EFFECT
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (selectedShot) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [selectedShot]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const grouped = screenshots.reduce<Record<string, Screenshot[]>>((acc, s) => {
    acc[s.url] = acc[s.url] || [];
    acc[s.url].push(s);
    return acc;
  }, {});

  const uniqueUrls = Object.keys(grouped);

  const toggleUrl = (url: string) => {
    setVisibleUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const displayedSites = Object.entries(grouped).filter(([url]) =>
    visibleUrls.includes(url)
  );

  // --- Versus Logic ---
  const openVersusMode = () => {
    setIsVersusOpen(true);
    setShowControls(true);
    if (uniqueUrls.length >= 2) {
      if (!leftSite) handleLeftSiteChange(uniqueUrls[0]);
      if (!rightSite) handleRightSiteChange(uniqueUrls[1]);
    } else if (uniqueUrls.length === 1) {
      if (!leftSite) handleLeftSiteChange(uniqueUrls[0]);
      if (!rightSite) handleRightSiteChange(uniqueUrls[0]);
    }
  };

  const handleLeftSiteChange = (site: string) => {
    setLeftSite(site);
    const shots = grouped[site];
    if (shots && shots.length > 0) setLeftShot(shots[0]);
  };

  const handleRightSiteChange = (site: string) => {
    setRightSite(site);
    const shots = grouped[site];
    if (shots && shots.length > 0) setRightShot(shots[0]);
  };

  // --- Dialog Backdrop Click Handler ---
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      setSelectedShot(null);
    }
  };

  const flatShots = displayedSites.flatMap(([, shots]) => shots);

  const currentIndex = selectedShot
    ? flatShots.findIndex((s) => s.id === selectedShot.id)
    : -1;

  const goPrev = () => {
    if (currentIndex > 0) {
      setSelectedShot(flatShots[currentIndex - 1]);
    }
  };

  const goNext = () => {
    if (currentIndex < flatShots.length - 1) {
      setSelectedShot(flatShots[currentIndex + 1]);
    }
  };

  useEffect(() => {
    if (!selectedShot) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "Escape") setSelectedShot(null);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedShot, currentIndex]);


  useEffect(() => {
    const saved = localStorage.getItem("deviceMode");
    if (saved === "desktop" || saved === "mobile") {
      setDeviceMode(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("deviceMode", deviceMode);
  }, [deviceMode]);


  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans tracking-tight selection:bg-neutral-200 overflow-hidden">

      {/* --- Sticky Header --- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-bold uppercase tracking-widest hidden sm:block">Kiosk 24/7</h1>
            <h1 className="text-sm font-bold uppercase tracking-widest sm:hidden">Kiosk</h1>

            {!loading && uniqueUrls.length > 0 && (
              <button
                onClick={openVersusMode}
                className="
    text-xs font-bold uppercase tracking-wider text-white
    px-5 py-2 rounded-full
    bg-linear-to-r from-pink-500 via-orange-400 to-yellow-400
    hover:brightness-110
    shadow-lg
    transition-all duration-200
    active:scale-95
  "
              >
                Versus Mode
              </button>

            )}
          </div>

          <div className="flex items-center gap-2 bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setDeviceMode("desktop")}
              className={`px-3 py-1 text-xs font-bold uppercase rounded-full transition
      ${deviceMode === "desktop"
                  ? "bg-black text-white"
                  : "text-gray-500 hover:text-black"}`}
            >
              Desktop
            </button>

            <button
              onClick={() => setDeviceMode("mobile")}
              className={`px-3 py-1 text-xs font-bold uppercase rounded-full transition
      ${deviceMode === "mobile"
                  ? "bg-black text-white"
                  : "text-gray-500 hover:text-black"}`}
            >
              Mobile
            </button>
          </div>


          <div className="relative" ref={calendarRef}>
            <button
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="text-sm font-medium hover:text-gray-500 transition-colors flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full"
            >
              <span>{format(date, "MMM d")}</span>
              <span className="text-[10px] transform rotate-90 opacity-40">❯</span>
            </button>

            {isCalendarOpen && (
              <div className="absolute top-full right-0 mt-4 bg-white border border-gray-100 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                <DayPicker
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) { setDate(d); setIsCalendarOpen(false); }
                  }}
                  modifiers={{ hasData: activeDates }}
                  modifiersStyles={{
                    hasData: { fontWeight: "700", textDecoration: "underline" },
                    selected: { backgroundColor: "#000", color: "#fff", borderRadius: "0" }
                  }}
                  disabled={{ after: new Date() }}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto pb-12 space-y-8">

        {/* --- Top Horizontal Navigation (With Favicons) --- */}
        {!loading && uniqueUrls.length > 0 && (
          <div className="sticky top-16 z-30 bg-white/95 backdrop-blur border-b border-gray-50 py-3">

            {/* Toggle button — mobile only */}
            <button
              onClick={() => setShowUrls((prev) => !prev)}
              className="md:hidden mx-auto mb-3 flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 transition"
            >
              {showUrls ? "Hide sources" : "Show sources"}
            </button>


            {/* Collapsible container */}
            <div
              className={`transition-all duration-300 overflow-hidden
        ${showUrls ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}
        md:max-h-none md:opacity-100`}
            >
              <div className="flex flex-wrap justify-center items-center gap-2 px-4 md:px-6">
                {uniqueUrls.map((url) => {
                  const isActive = visibleUrls.includes(url);

                  return (
                    <button
                      key={url}
                      onClick={() => toggleUrl(url)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 whitespace-nowrap
                ${isActive
                          ? "bg-black text-white shadow-md"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-black"
                        }`}
                    >
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${url}&sz=64`}
                        alt=""
                        className="w-4 h-4 rounded-sm object-contain opacity-90"
                      />
                      <span>{url}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* Loading / Empty States */}
        {loading && <div className="py-20 text-center text-sm text-gray-400 animate-pulse">Syncing timestamps...</div>}

        {!loading && uniqueUrls.length > 0 && displayedSites.length === 0 && (
          <div className="py-20 text-center text-sm text-gray-400">Tap a site above to begin.</div>
        )}

        {/* Content Rows */}
        <div className="px-4 md:px-6 space-y-10">
          {displayedSites.map(([url, shots]) => (
            <section key={url} id={url} className="group animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                {/* Header with Favicon */}
                <div className="flex items-center gap-2">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${url}&sz=64`}
                    alt=""
                    className="w-4 h-4 rounded-sm object-contain"
                  />
                  <h2 className="text-sm font-bold text-black tracking-tight">{url}</h2>
                </div>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{shots.length}</span>
              </div>

              <Swiper
                slidesPerView="auto"
                spaceBetween={16}
                freeMode={true}
                grabCursor={true}
                simulateTouch={true}
                mousewheel={{ forceToAxis: true }}
                modules={[FreeMode, Mousewheel]}
                className="!pb-4 !overflow-visible"
              >
                {shots.map((shot) => (
                  <SwiperSlide key={shot.id} className="!w-auto">
                    <div
                      onClick={() => setSelectedShot(shot)}
                      className={`
                              relative w-64 sm:w-72
                              bg-gray-50 overflow-hidden rounded-md
                              transition-transform active:scale-[0.98]
                              text-left group/card shadow-sm border border-gray-100
                              block cursor-pointer select-none 
                              ${deviceMode === "mobile" ? "aspect-9/16" : "aspect-video"}
                            `}                    >
                      {shot.cloudinary_url ? (
                        <img
                          src={optimizedImage(shot.cloudinary_url, 600)}
                          alt=""
                          draggable={false}
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300">NO SIGNAL</div>
                      )}
                      <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded-sm shadow-sm">
                        <span className="text-[10px] font-bold text-black uppercase tracking-wider font-mono">
                          {formatTime(shot.captured_at)}
                        </span>
                      </div>
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>
            </section>
          ))}
        </div>
      </main>

      {/* --- DIALOG MODAL --- */}
      <dialog
        ref={dialogRef}
        onClose={() => setSelectedShot(null)}
        onClick={handleDialogClick}
        className="w-screen h-screen max-w-none max-h-none m-0 bg-transparent p-0 outline-none backdrop:bg-black/95 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 duration-200"
      >
        {selectedShot && (
          <div className="w-full overflow-hidden h-full flex flex-col items-center justify-between">

            {/* 1. Close Button (Absolute Top Right) */}
            <button
              onClick={() => setSelectedShot(null)}
              autoFocus
              className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-white/10 text-white rounded-full hover:bg-white/20 transition active:scale-90"
            >
              <span className="text-2xl leading-none pb-1">&times;</span>
            </button>

            {/* Left Arrow */}
            <button
              onClick={goPrev}
              disabled={currentIndex <= 0}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-40
             w-12 h-12 flex items-center justify-center
             bg-black/40 text-white rounded-full
             hover:bg-black/60 transition
             disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Previous screenshot"
            >
              <span className="text-3xl leading-none">&#10094;</span>
            </button>

            {/* Right Arrow */}
            <button
              onClick={goNext}
              disabled={currentIndex >= flatShots.length - 1}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-40
             w-12 h-12 flex items-center justify-center
             bg-black/40 text-white rounded-full
             hover:bg-black/60 transition
             disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Next screenshot"
            >
              <span className="text-3xl leading-none">&#10095;</span>
            </button>


            {/* 2. Image Container (Flex Grow + Min-Height 0) */}
            <div className="flex-1 w-full min-h-0 p-4 flex items-center justify-center relative">
              {selectedShot.cloudinary_url && (
                <img
                  src={optimizedImage(selectedShot.cloudinary_url, 1600)}
                  alt={selectedShot.url}
                  className="max-w-full max-h-full object-contain shadow-2xl rounded z-10"
                />

              )}
            </div>

            {/* 3. Footer info (With Favicon) */}
            <div className="flex-none w-full p-6 text-center text-white/80 bg-gradient-to-t from-black/50 to-transparent">
              <div className="flex items-center justify-center gap-2">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${selectedShot.url}&sz=64`}
                  alt=""
                  className="w-4 h-4 rounded-sm object-contain opacity-80"
                />
                <h3 className="text-sm font-bold tracking-widest uppercase">{selectedShot.url}</h3>
              </div>
              <p className="text-xs font-mono opacity-70 mt-1">{formatTime(selectedShot.captured_at)}</p>
            </div>
          </div>
        )}
      </dialog>

      {/* --- Responsive Versus Mode --- */}
      {isVersusOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom-10 duration-300">

          {/* Header */}
          <div className="flex-none h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-bold uppercase tracking-widest">Versus Mode</h2>
              <button
                onClick={() => setShowControls(!showControls)}
                className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 transition"
              >
                {showControls ? "Hide Options" : "Show Options"}
              </button>
            </div>
            <button
              onClick={() => setIsVersusOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
            >
              <span className="text-xl leading-none pb-1">&times;</span>
            </button>
          </div>

          {/* Split Main Area */}
          <div className="flex-grow flex flex-col md:flex-row h-full overflow-hidden">
            {/* 1. Desktop Sidebar */}
            <aside className={`hidden md:flex flex-col border-r border-gray-100 bg-gray-50/50 transition-all duration-300 overflow-hidden ${showControls ? "w-80 opacity-100" : "w-0 opacity-0 border-none"}`}>
              <div className="flex-1 flex flex-col overflow-hidden min-w-[320px]">
                <div className="flex-1 p-6 overflow-y-auto border-b border-gray-200">
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Left Side</label>
                  <select value={leftSite} onChange={(e) => handleLeftSiteChange(e.target.value)} className="w-full mb-4 p-2 text-sm bg-white border border-gray-200 rounded outline-none">{uniqueUrls.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  <div className="flex flex-wrap gap-2">{grouped[leftSite]?.map(shot => (<button key={`l-${shot.id}`} onClick={() => setLeftShot(shot)} className={`px-2 py-1 text-[10px] font-mono border rounded ${leftShot?.id === shot.id ? "bg-black text-white border-black" : "bg-white border-gray-200"}`}>{formatTime(shot.captured_at)}</button>))}</div>
                </div>
                <div className="flex-1 p-6 overflow-y-auto bg-white">
                  <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Right Side</label>
                  <select value={rightSite} onChange={(e) => handleRightSiteChange(e.target.value)} className="w-full mb-4 p-2 text-sm bg-gray-50 border border-gray-200 rounded outline-none">{uniqueUrls.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  <div className="flex flex-wrap gap-2">{grouped[rightSite]?.map(shot => (<button key={`r-${shot.id}`} onClick={() => setRightShot(shot)} className={`px-2 py-1 text-[10px] font-mono border rounded ${rightShot?.id === shot.id ? "bg-black text-white border-black" : "bg-white border-gray-200"}`}>{formatTime(shot.captured_at)}</button>))}</div>
                </div>
              </div>
            </aside>
            {/* 2. The Stage */}
            <div className="flex-grow relative bg-gray-50/50 flex items-center justify-center overflow-hidden touch-none p-4">
              {leftShot && rightShot && leftShot.cloudinary_url && rightShot.cloudinary_url ? (
                <div className="relative w-full h-full shadow-2xl rounded-lg overflow-hidden border border-gray-200">
                  <ReactCompareSlider
                    itemOne={<ReactCompareSliderImage src={optimizedImage(leftShot.cloudinary_url, 1600)} alt="Left" style={{ objectFit: 'contain', width: '100%', height: '100%', backgroundColor: '#f9fafb' }} />}
                    itemTwo={<ReactCompareSliderImage src={optimizedImage(rightShot.cloudinary_url, 1600)} alt="Right" style={{ objectFit: 'contain', width: '100%', height: '100%', backgroundColor: '#f9fafb' }} />}
                    style={{ height: "100%", width: "100%" }}
                  />
                </div>
              ) : (<div className="text-gray-400 text-xs tracking-widest">Select comparison data</div>)}
            </div>
          </div>

          {/* 3. Mobile Bottom Sheet */}
          <div className={`md:hidden flex-none bg-white border-t border-gray-100 flex flex-col pb-safe transition-all duration-300 ${showControls ? "h-auto border-t" : "h-0 overflow-hidden border-none"}`}>
            <div className="flex border-b border-gray-100">
              <button onClick={() => setMobileActiveSide("left")} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${mobileActiveSide === "left" ? "border-black text-black bg-gray-50" : "border-transparent text-gray-400"}`}>Left Side</button>
              <div className="w-px bg-gray-100"></div>
              <button onClick={() => setMobileActiveSide("right")} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${mobileActiveSide === "right" ? "border-black text-black bg-gray-50" : "border-transparent text-gray-400"}`}>Right Side</button>
            </div>
            <div className="p-4 h-48 overflow-y-auto">
              <div className="mb-4">
                <select value={mobileActiveSide === "left" ? leftSite : rightSite} onChange={(e) => mobileActiveSide === "left" ? handleLeftSiteChange(e.target.value) : handleRightSiteChange(e.target.value)} className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-sm font-medium outline-none focus:border-black transition">{uniqueUrls.map(u => <option key={u} value={u}>{u}</option>)}</select>
              </div>
              <div>
                <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">{(mobileActiveSide === "left" ? grouped[leftSite] : grouped[rightSite])?.map(shot => { const isSelected = mobileActiveSide === "left" ? leftShot?.id === shot.id : rightShot?.id === shot.id; return (<button key={shot.id} onClick={() => mobileActiveSide === "left" ? setLeftShot(shot) : setRightShot(shot)} className={`flex-none px-3 py-2 text-xs font-mono border rounded-lg transition-all active:scale-95 ${isSelected ? "bg-black text-white border-black shadow-md" : "bg-white text-gray-500 border-gray-200"}`}>{formatTime(shot.captured_at)}</button>); })}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
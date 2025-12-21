"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";

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
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function optimizedImage(url: string, width = 1440) {
  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width}/`);
}

export default function Home() {
  const [date, setDate] = useState<Date>(new Date());
  const [activeDates, setActiveDates] = useState<Date[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleUrls, setVisibleUrls] = useState<string[]>(DEFAULT_SITES);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedShot, setSelectedShot] = useState<Screenshot | null>(null);

  const calendarRef = useRef<HTMLDivElement>(null);

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
        .gte("captured_at", start.toISOString())
        .lt("captured_at", end.toISOString())
        .order("url")
        .order("captured_at");

      if (data) setScreenshots(data);
      setLoading(false);
    }
    load();
  }, [date]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const grouped = screenshots.reduce<Record<string, Screenshot[]>>(
    (acc, s) => {
      acc[s.url] = acc[s.url] || [];
      acc[s.url].push(s);
      return acc;
    },
    {}
  );

  const uniqueUrls = Object.keys(grouped);

  const currentGroup = selectedShot ? grouped[selectedShot.url] : [];
  const currentIndex = selectedShot ? currentGroup.findIndex(s => s.id === selectedShot.id) : -1;

  const handleNext = useCallback(() => {
    if (currentIndex < currentGroup.length - 1) {
      setSelectedShot(currentGroup[currentIndex + 1]);
    }
  }, [currentIndex, currentGroup]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedShot(currentGroup[currentIndex - 1]);
    }
  }, [currentIndex, currentGroup]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!selectedShot) return;

      if (event.key === "Escape") setSelectedShot(null);
      if (event.key === "ArrowRight") handleNext();
      if (event.key === "ArrowLeft") handlePrev();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedShot, handleNext, handlePrev]);


  const toggleUrl = (url: string) => {
    setVisibleUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const displayedSites = Object.entries(grouped).filter(([url]) =>
    visibleUrls.includes(url)
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-6 bg-slate-900 rounded-full"></div>
            <h1 className="text-lg font-bold tracking-tight">Kiosk 24/7</h1>
          </div>

          <div className="relative" ref={calendarRef}>
            <button
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 transition text-sm font-medium text-slate-700"
            >
              <span className="text-base leading-none">📅</span>
              <span>{format(date, "MMM dd, yyyy")}</span>
            </button>

            {isCalendarOpen && (
              <div className="absolute top-full right-0 mt-4 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                <DayPicker
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) {
                      setDate(d);
                      setIsCalendarOpen(false);
                    }
                  }}
                  modifiers={{ hasData: activeDates }}
                  modifiersStyles={{
                    hasData: {
                      fontWeight: "bold",
                      color: "#0f172a",
                      backgroundColor: "#f1f5f9",
                      borderRadius: "100%",
                    },
                    selected: {
                      backgroundColor: "#000",
                      color: "#fff",
                    }
                  }}
                  disabled={{ after: new Date() }}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-8 space-y-12">
        {!loading && uniqueUrls.length > 0 && (
          <nav className="flex flex-wrap gap-2">
            {uniqueUrls.map((url) => {
              const isActive = visibleUrls.includes(url);
              return (
                <button
                  key={url}
                  onClick={() => toggleUrl(url)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border
                    ${isActive
                      ? "bg-slate-900 text-white border-slate-900 shadow-md transform scale-105"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                    }`}
                >
                  {url}
                </button>
              );
            })}
          </nav>
        )}

        {loading && (
          <div className="py-20 flex justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-2 w-24 bg-slate-200 rounded"></div>
              <div className="h-64 w-96 bg-slate-100 rounded-xl"></div>
            </div>
          </div>
        )}

        {!loading && uniqueUrls.length > 0 && displayedSites.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            Select a source above to begin.
          </div>
        )}

        {displayedSites.map(([url, shots]) => (
          <section
            key={url}
            id={url}
            className="group animate-in fade-in slide-in-from-bottom-4 duration-700"
          >
            <div className="flex items-baseline gap-3 mb-4 px-1">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {url}
              </h2>
              <span className="text-xs font-medium text-slate-400">
                {shots.length} updates
              </span>
              <div className="h-px bg-slate-100 flex-grow ml-4"></div>
            </div>

            <div className="flex overflow-x-auto gap-5 pb-8 -mx-4 px-4 scrollbar-hide snap-x">
              {shots.map((shot) => (
                <button
                  key={shot.id}
                  onClick={() => setSelectedShot(shot)}
                  className="relative flex-none w-72 sm:w-80 aspect-video rounded-xl overflow-hidden bg-slate-100 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 snap-start group/card cursor-zoom-in text-left"
                >
                  {shot.cloudinary_url ? (
                    <img
                      src={optimizedImage(shot.cloudinary_url, 600)}
                      alt={`${url} at ${shot.captured_at}`}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                      <span className="text-xs">No Image</span>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"></div>

                  <div className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/50 w-8 h-8 flex items-center justify-center rounded-full text-white backdrop-blur-sm">
                      <span className="text-lg leading-none pb-1">⤢</span>
                    </div>
                  </div>

                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                    <span className="bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">
                      {formatTime(shot.captured_at)}
                    </span>
                  </div>
                </button>
              ))}
              <div className="w-4 flex-none"></div>
            </div>
          </section>
        ))}
      </main>

      {selectedShot && selectedShot.cloudinary_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedShot(null)}
        >
          <button
            onClick={() => setSelectedShot(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition z-50"
          >
            <span className="text-3xl leading-none pb-1">&times;</span>
          </button>

          {currentIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition z-50 group"
            >
              <span className="text-3xl leading-none pb-1 group-hover:-translate-x-0.5 transition-transform">&larr;</span>
            </button>
          )}

          {currentIndex < currentGroup.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition z-50 group"
            >
              <span className="text-3xl leading-none pb-1 group-hover:translate-x-0.5 transition-transform">&rarr;</span>
            </button>
          )}

          <div
            className="relative w-full h-full flex flex-col items-center justify-center pointer-events-none"
          >
            <img
              src={optimizedImage(selectedShot.cloudinary_url, 1600)}
              alt="Full screenshot"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            />

            <div className="mt-4 flex flex-col items-center gap-1 pointer-events-auto">
              <h3 className="text-white font-semibold text-lg">{selectedShot.url}</h3>
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <span>{formatTime(selectedShot.captured_at)}</span>
                <span>•</span>
                <span>{currentIndex + 1} of {currentGroup.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
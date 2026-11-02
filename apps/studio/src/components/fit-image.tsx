export function FitImage({
  src,
  alt,
  maxHeightClass = "max-h-[75vh]",
}: {
  src: string;
  alt: string;
  maxHeightClass?: string;
}) {
  return (
    <div className={`${maxHeightClass} flex w-full min-w-0 items-center justify-center overflow-hidden rounded-lg`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={`${maxHeightClass} w-full object-contain`} />
    </div>
  );
}

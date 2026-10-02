export type Destination = {
  slug: string; name: string; region: string; mood: string; description: string;
  image: string; latitude: number; longitude: number;
};

export const destinations: Destination[] = [
  { slug: "goa", name: "Goa", region: "India · West coast", mood: "Slow days, salt air", description: "Beach mornings, colorful lanes, and unhurried coastal evenings. Discover a different side of Goa through the places along the way.", image: "/images/goa.jpg", latitude: 15.49, longitude: 73.83 },
  { slug: "varkala", name: "Varkala", region: "Kerala · India", mood: "Cliffs meet the coast", description: "Follow the coast from cliffside cafés to quiet stretches of sand. Varkala is a place to slow down and take the scenic way.", image: "/images/varkala.jpg", latitude: 8.74, longitude: 76.72 },
  { slug: "munnar", name: "Munnar", region: "Kerala · India", mood: "Into the green", description: "Mist over the hills, winding roads, and long views across tea country. Let the little stops become part of your Munnar story.", image: "/images/munnar.jpg", latitude: 10.09, longitude: 77.06 },
  { slug: "kochi", name: "Kochi", region: "Kerala · India", mood: "A city with stories", description: "Waterfront walks, art-filled corners, and old streets made for wandering. Explore Kochi one neighborhood and one shared moment at a time.", image: "/images/kochi.jpg", latitude: 9.97, longitude: 76.28 },
  { slug: "thenkasi", name: "Thenkasi", region: "Tamil Nadu · India", mood: "Waterfalls & hill roads", description: "A journey through waterfall country, local streets, and the foothills of the Western Ghats. Make room for the stops you didn't plan.", image: "/images/thenkasi.jpg", latitude: 8.96, longitude: 77.31 },
];

export function getDestination(slug: string) {
  return destinations.find((destination) => destination.slug === slug);
}

export function searchDestinations(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return destinations;
  return destinations.filter((destination) => `${destination.name} ${destination.region} ${destination.slug === "thenkasi" ? "Tenkasi" : ""}`.toLowerCase().includes(normalized));
}

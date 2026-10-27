import Link from 'next/link';
import { TravelImage } from '@/components/ui/travel-image';
import { JourneyGlobe } from './journey-globe';
import styles from './journey-hero.module.css';

export function JourneyHero() {
  return <section aria-labelledby="home-heading" className={styles.hero}>
    <div className={styles.image}><TravelImage src="/images/varkala.jpg" alt="" sizes="(max-width: 1200px) 100vw, 1100px" priority /></div>
    <div className={styles.shade} aria-hidden="true" />
    <div className={styles.content}>
      <p className={styles.eyebrow}>✳ &nbsp; For the curious &amp; the adventurous</p>
      <h1 id="home-heading" className={styles.heading}>Find your<br /><em>somewhere.</em></h1>
      <p className={styles.description}>For the roads you haven’t taken and the stories waiting along the way. Discover journeys, make them your own, and remember every moment.</p>
      <div className={styles.buttons}><Link href="/explore" className={styles.primary}>Explore journeys &nbsp; ↗</Link><a href="#journeys-heading" className={styles.secondary}>Discover stories &nbsp; ↓</a></div>
      <p className={styles.note}>— &nbsp; YOUR NEXT STORY STARTS HERE</p>
    </div>
    <JourneyGlobe />
  </section>;
}

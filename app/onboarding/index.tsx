import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { type ArtistCard } from "@/lib/artistService";
import { getBestImageUrl } from "@/lib/musicData";
import {
  StepArtists,
  StepDOB,
  StepFinding,
  StepGender,
  StepGenres,
  StepGreatPicks,
  StepName,
} from "@/components/onboarding/OnboardingSteps";
import { haptic, hapticSuccess, onboardingStyles as s } from "@/components/onboarding/onboardingShared";

export default function OnboardingScreen() {
  return <OnboardingScreenView />;
}

function OnboardingScreenView() {
  const insets = useSafeAreaInsets();
  const { user, firebaseUser } = useAuth();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dob, setDob] = useState(() => new Date(2000, 0, 1));
  const [name, setName] = useState(user?.name || "");
  const [gender, setGender] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<ArtistCard[]>([]);
  const finishTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearFinishTimers = useCallback(() => {
    finishTimersRef.current.forEach(clearTimeout);
    finishTimersRef.current = [];
  }, []);

  useEffect(() => {
    return clearFinishTimers;
  }, [clearFinishTimers]);

  const toggleGenre = useCallback((id: string) => {
    setGenres((p) => p.includes(id) ? p.filter((g) => g !== id) : [...p, id]);
  }, []);

  const toggleArtist = useCallback((a: ArtistCard) => {
    setSelectedArtists((p) => p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : [...p, a]);
  }, []);

  const saveToFirestore = useCallback(async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        fullName: name.trim(),
        dateOfBirth: dob.toISOString().split("T")[0],
        gender,
        preferredGenres: genres,
        favoriteArtists: selectedArtists.map((a) => ({
          id: a.id,
          name: a.name,
          image: a.image?.length ? getBestImageUrl(a.image) : "",
        })),
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Keep onboarding usable if profile metadata cannot be saved.
    } finally {
      setSaving(false);
    }
  }, [dob, firebaseUser, gender, genres, name, selectedArtists]);

  const handleFinish = useCallback(async () => {
    setStep(5);
    await saveToFirestore();
    const findingTimer = setTimeout(() => {
      setStep(6);
      hapticSuccess();
      const redirectTimer = setTimeout(() => router.replace("/(tabs)"), 2000);
      finishTimersRef.current.push(redirectTimer);
    }, 1800);
    finishTimersRef.current.push(findingTimer);
  }, [saveToFirestore]);

  const goBack = useCallback(() => {
    if (step === 0) {
      router.back();
      return;
    }
    haptic();
    setStep((s) => s - 1);
  }, [step]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const showHeader = step < 5;

  return (
    <View style={[s.container, { paddingTop: topInset }]}>
      {showHeader ? (
        <View style={s.header}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={s.headerTitle}>Create account</Text>
          <View style={{ width: 36 }} />
        </View>
      ) : null}

      {step === 0 ? <StepDOB value={dob} onChange={setDob} onNext={() => setStep(1)} /> : null}
      {step === 1 ? <StepName value={name} onChange={setName} onNext={() => setStep(2)} /> : null}
      {step === 2 ? <StepGender value={gender} onChange={setGender} onNext={() => setStep(3)} /> : null}
      {step === 3 ? <StepGenres selected={genres} onToggle={toggleGenre} onNext={() => setStep(4)} /> : null}
      {step === 4 ? (
        <StepArtists
          genres={genres}
          selectedIds={selectedArtists.map((a) => a.id)}
          onToggle={toggleArtist}
          onFinish={handleFinish}
          saving={saving}
        />
      ) : null}
      {step === 5 ? <StepFinding /> : null}
      {step === 6 ? <StepGreatPicks artists={selectedArtists} /> : null}
    </View>
  );
}

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../components/layout/PageHeader';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

export function HelpCenterScreen() {
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="Help Center" showBack />
            <ScrollView className="flex-1 px-6 py-8">
                <View className="items-center mb-8">
                    <View className="bg-primary/10 p-4 rounded-full">
                        <Ionicons name="help-circle-outline" size={48} color="#10B981" />
                    </View>
                    <Text className="text-2xl font-bold text-white mt-4 text-center">How can we help?</Text>
                    <Text className="text-gray-400 text-center mt-2">Find answers to the most common questions</Text>
                </View>

                <View className="bg-card p-6 rounded-2xl border border-white/5 space-y-6">
                    <Text className="text-white font-bold text-lg mb-2">Frequently Asked Questions</Text>

                    {/* FAQ 1 */}
                    <View className="border-t border-white/5 pt-4">
                        <Text className="text-primary font-bold mb-1">1. How do I join a tournament?</Text>
                        <Text className="text-gray-400 text-sm leading-5">
                            Navigate to the Hubs screen, find a Hub you like in the Discovery section, and join it. Once you are a member, you can find active competitions under the Upcoming Tournaments section.
                        </Text>
                    </View>

                    {/* FAQ 2 */}
                    <View className="border-t border-white/5 pt-4">
                        <Text className="text-primary font-bold mb-1">2. How do I report a match result?</Text>
                        <Text className="text-gray-400 text-sm leading-5">
                            You can report your score from your Home page by clicking on the active match, or by going to the tournament Bracket tab, clicking on your match, and submitting the result.
                        </Text>
                    </View>

                    {/* FAQ 3 */}
                    <View className="border-t border-white/5 pt-4">
                        <Text className="text-primary font-bold mb-1">3. How can I create my own Hub?</Text>
                        <Text className="text-gray-400 text-sm leading-5">
                            Go to the Hubs section and click the "Create" button. Follow the instructions to set up your community and start building your player base.
                        </Text>
                    </View>

                    {/* FAQ 4 */}
                    <View className="border-t border-white/5 pt-4">
                        <Text className="text-primary font-bold mb-1">4. How do I find new Hubs to join?</Text>
                        <Text className="text-gray-400 text-sm leading-5">
                            Use the Discovery tab within the Hubs section. This allows you to explore and search for different gaming communities that you might want to join.
                        </Text>
                    </View>

                    {/* FAQ 5 */}
                    <View className="border-t border-white/5 pt-4">
                        <Text className="text-primary font-bold mb-1">5. How do I create a tournament?</Text>
                        <Text className="text-gray-400 text-sm leading-5">
                            You must be the owner of a Hub to create tournaments. If you own a Hub, go to its settings menu where you will find the option to create and configure a new tournament.
                        </Text>
                    </View>

                    {/* FAQ 6 */}
                    <View className="border-t border-white/5 pt-4">
                        <Text className="text-primary font-bold mb-1">6. How can I change my password?</Text>
                        <Text className="text-gray-400 text-sm leading-5">
                            Navigate to your Profile screen. Under the account settings, you will find the option to securely update your password.
                        </Text>
                    </View>
                </View>

                {/* Dodatna sekcija za podršku */}
                <View className="mt-8 mb-12">
                    <Text className="text-white font-bold mb-4">Still need help?</Text>
                    <Text className="text-white font-bold mb-4">support@codespheresolutions.de</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

export function AboutUsScreen() {
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="About Us" showBack />
            <ScrollView className="flex-1 px-6 py-8">
                <View className="items-center mb-8">
                    <View className="bg-primary/10 p-4 rounded-full">
                        <Ionicons name="information-circle-outline" size={48} color="#10B981" />
                    </View>
                    <Text className="text-3xl font-bold text-white mt-4">GameHubz</Text>
                </View>

                <View className="bg-card p-6 rounded-2xl border border-white/5">
                    <Text className="text-gray-300 leading-7 text-center text-base">
                        GameHubz is the ultimate platform for tournament organizers and competitive gamers.
                        We provide the professional tools you need to create, manage, and scale your gaming communities
                        from the ground up.
                    </Text>


                </View>

                <View className="mt-12 items-center">
                    <Text className="text-gray-500 text-xs tracking-widest uppercase">Version {Constants.expoConfig?.version || '1.0.0'}</Text>
                    <Text className="text-gray-500 text-xs mt-2">© 2026 CodeSphere Solutions</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// ContactUsScreen ostaje sličan, samo sam ga vizuelno malo uskladio sa ostalima
export function ContactUsScreen() {
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="Contact Us" showBack />
            <ScrollView className="flex-1 px-6 py-8">
                <View className="items-center mb-10">
                    <View className="bg-primary/10 p-4 rounded-full">
                        <Ionicons name="mail-outline" size={48} color="#10B981" />
                    </View>
                    <Text className="text-2xl font-bold text-white mt-4">Get in Touch</Text>
                    <Text className="text-gray-400 text-center mt-2 px-8">
                        Our team is here to support your competitive journey.
                    </Text>
                </View>

                <View className="space-y-4">
                    <TouchableOpacity className="bg-card p-5 rounded-2xl border border-white/5 flex-row items-center gap-4">
                        <View className="bg-primary/20 p-3 rounded-xl">
                            <Ionicons name="mail" size={24} color="#10B981" />
                        </View>
                        <View>
                            <Text className="text-white font-bold text-base">Email Support</Text>
                            <Text className="text-gray-400 text-sm">support@codespheresolutions.dev</Text>
                        </View>
                    </TouchableOpacity>

                    {/* <TouchableOpacity className="bg-card p-5 rounded-2xl border border-white/5 flex-row items-center gap-4">
                        <View className="bg-[#7289DA]/20 p-3 rounded-xl">
                            <Ionicons name="logo-discord" size={24} color="#7289DA" />
                        </View>
                        <View>
                            <Text className="text-white font-bold text-base">Join our Discord</Text>
                            <Text className="text-gray-400 text-sm">discord.gg/gamehubz</Text>
                        </View>
                    </TouchableOpacity> */}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
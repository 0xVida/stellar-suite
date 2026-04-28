'use client';

import React from 'react';
import { Check, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    description: 'Perfect for individual developers and small experiments.',
    features: [
      { name: 'Unlimited Public Contracts', included: true },
      { name: 'Basic IDE Features', included: true },
      { name: 'Community Support', included: true },
      { name: 'Advanced Debugging', included: false },
      { name: 'Custom Network Support', included: false },
      { name: 'Priority Support', included: false },
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$49',
    description: 'Advanced tools for professional Soroban developers.',
    features: [
      { name: 'Unlimited Public Contracts', included: true },
      { name: 'Advanced IDE Features', included: true },
      { name: 'Community Support', included: true },
      { name: 'Advanced Debugging', included: true },
      { name: 'Custom Network Support', included: true },
      { name: 'Priority Support', included: false },
    ],
    cta: 'Go Pro',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Bespoke solutions for large teams and organizations.',
    features: [
      { name: 'Unlimited Public Contracts', included: true },
      { name: 'Advanced IDE Features', included: true },
      { name: 'Community Support', included: true },
      { name: 'Advanced Debugging', included: true },
      { name: 'Custom Network Support', included: true },
      { name: 'Priority Support', included: true },
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export function PricingTable() {
  const handleSubscribe = (tierName: string) => {
    toast.success(`Redirecting to ${tierName} checkout...`, {
      description: 'This is a mock checkout flow.',
    });
  };

  return (
    <section className="py-24 px-4 bg-background">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Choose the plan that fits your development needs. Upgrade or downgrade at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {TIERS.map((tier) => (
            <Card 
              key={tier.name} 
              className={`flex flex-col relative transition-all duration-300 hover:scale-[1.02] ${
                tier.highlighted ? 'border-primary shadow-2xl ring-2 ring-primary/20' : 'border-border'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              )}
              
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                <CardDescription className="min-h-[40px] mt-2">{tier.description}</CardDescription>
                <div className="mt-6 flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
                  {tier.price !== 'Custom' && <span className="text-muted-foreground">/month</span>}
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="space-y-4">
                  {tier.features.map((feature) => (
                    <div key={feature.name} className="flex items-center gap-3">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className={`text-sm ${feature.included ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>

              <CardFooter>
                <Button 
                  className="w-full h-12 text-lg" 
                  variant={tier.highlighted ? 'default' : 'outline'}
                  onClick={() => handleSubscribe(tier.name)}
                >
                  {tier.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>All plans include a 14-day free trial of Pro features. No credit card required to start.</p>
        </div>
      </div>
    </section>
  );
}

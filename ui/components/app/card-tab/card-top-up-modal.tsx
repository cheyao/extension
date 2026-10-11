import React, { useCallback, useState } from 'react';
import {
  Box,
  BoxFlexDirection,
  FontWeight,
  Text,
  TextColor,
  TextVariant,
} from '@metamask/design-system-react';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  FormTextField,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  TextFieldType,
} from '../../component-library';

// Mock list of assets the card can be topped up with.
const TOP_UP_ASSETS = ['ETH', 'USDC', 'USDT', 'BTC'] as const;

type TopUpAsset = (typeof TOP_UP_ASSETS)[number];

type CardTopUpModalProps = Readonly<{
  onClose: () => void;
}>;

/**
 * Mock top-up dialog for the card: pick a crypto asset and an amount. Buying
 * only closes the dialog — nothing is sent anywhere.
 *
 * @param props - Component props.
 * @param props.onClose - Called when the dialog is closed or the buy is made.
 */
export const CardTopUpModal = ({ onClose }: CardTopUpModalProps) => {
  const t = useI18nContext();
  const [asset, setAsset] = useState<TopUpAsset>(TOP_UP_ASSETS[0]);
  const [amount, setAmount] = useState('');

  const isValidAmount = Number(amount) > 0;

  const handleAmountChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAmount(event.target.value);
    },
    [],
  );

  return (
    <Modal isOpen onClose={onClose} data-testid="card-top-up-modal">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader onClose={onClose}>{t('cardTopUp')}</ModalHeader>
        <ModalBody>
          <Box flexDirection={BoxFlexDirection.Column} gap={4}>
            <Box flexDirection={BoxFlexDirection.Column} gap={2}>
              <Text variant={TextVariant.BodyMd} fontWeight={FontWeight.Medium}>
                {t('cardTopUpSelectCrypto')}
              </Text>
              <Box flexDirection={BoxFlexDirection.Row} gap={2}>
                {TOP_UP_ASSETS.map((option) => {
                  const isSelected = option === asset;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setAsset(option)}
                      className={`flex-1 rounded-lg border py-2 ${
                        isSelected
                          ? 'border-primary-default bg-primary-muted'
                          : 'border-muted bg-default'
                      }`}
                      data-testid={`card-top-up-asset-${option}`}
                    >
                      <Text
                        variant={TextVariant.BodyMd}
                        fontWeight={FontWeight.Medium}
                        color={
                          isSelected
                            ? TextColor.PrimaryDefault
                            : TextColor.TextDefault
                        }
                      >
                        {option}
                      </Text>
                    </button>
                  );
                })}
              </Box>
            </Box>

            <FormTextField
              id="card-top-up-amount"
              label={t('amount')}
              placeholder="0.00"
              type={TextFieldType.Number}
              value={amount}
              onChange={handleAmountChange}
              endAccessory={
                <Text
                  variant={TextVariant.BodyMd}
                  color={TextColor.TextAlternative}
                  className="pr-2"
                >
                  {asset}
                </Text>
              }
              inputProps={{
                min: 0,
                step: 'any',
                'data-testid': 'card-top-up-amount-input',
              }}
            />
          </Box>
        </ModalBody>
        <ModalFooter
          onSubmit={onClose}
          onCancel={onClose}
          submitButtonProps={{
            children: t('buy'),
            disabled: !isValidAmount,
            'data-testid': 'card-top-up-buy',
          }}
        />
      </ModalContent>
    </Modal>
  );
};
